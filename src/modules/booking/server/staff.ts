import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { can, createServerClient, createServiceClient, recordAuditAfterCommit, requirePerm } from "@/modules/access";
import { MoneyRulesSchema } from "@/modules/tenants/client";
import { parseRupees } from "@/sections/shared/format";
import { addDays } from "@/sections/shared/hours";
import { applyOverride, priceQuote, quoteOverride, snapshotOf, storedQuote, type PriceInput, type Quote, type QuoteSnapshot } from "../pricing";
import { todayIn } from "../request";
import { check, datePriceFor, MAX_INT4 } from "./request";

// Staff paths. `tenantId` always comes from getDashboard() in the calling server action, never from the browser.
// Reads for lists and details use the session client (RLS). Confirm, decline and cancel check permissions here,
// then call service-role SQL functions, so a staff client can never post its own "calculated" total.

export type StaffBookingRow = {
  id: string;
  reference: string;
  /** Stored status, or "expired" for a request whose date has passed in the venue time zone. */
  status: string;
  eventDate: string;
  slot: string;
  hall: string | null;
  customerName: string;
  customerPhone: string;
  guests: number;
  eventType: string;
  /** The stored final total, never summed lines. Null until confirmed. */
  totalPaisa: number | null;
};

export type StaffBookingDetail = StaffBookingRow & {
  packageName: string | null;
  addons: string[];
  history: { from: string | null; to: string; at: string; reason: string | null }[];
  quote: Quote | null;
  /** Set when staff changed the total: the calculated total and the reason. Staff only. */
  override: { calculatedPaisa: number; reason: string } | null;
  /** The venue's time zone, for showing history times. */
  timeZone: string;
};

export type StatusResult = { ok: true } | { error: "invalid" | "forbidden" | "notFound" | "state" | "refundChoice" };
export type ConfirmResult =
  | { ok: true }
  | { error: "invalid" | "forbidden" | "notFound" | "slotTaken" | "capacity" | "state" | "outOfRange" | "priceChanged" };

const STATUSES = ["requested", "confirmed", "declined", "cancelled"] as const;
/** List filters: the stored statuses plus "expired", a request whose date has passed. */
const FILTERS = [...STATUSES, "expired"] as const;
/** Postgres exclusion_violation: the no_overlap constraint. */
const EXCLUSION = "23P01";
/** Postgres raise_exception, as the transition guard and confirm_booking raise it. */
const RAISED = "P0001";

const Uuid = z.uuid();
const Reason = z.string().trim().min(3).max(300);
// Bad filters from the URL are dropped, not errors: the list just shows everything.
const ListQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
  status: z.enum(FILTERS).optional().catch(undefined),
});
const ConfirmInput = z.object({
  hallId: z.uuid(),
  finalTotalRupees: z.string().optional(),
  reason: z.string().optional(),
  previewedTotalPaisa: z.string().optional(),
});

const ROW_COLUMNS =
  "id, reference, status, event_date, guests, event_type_name, package_name, addon_names, current_quote_id, " +
  "slot:slots(name), hall:halls(name), customer:customers(name, phone_e164)";

// The current quote's total comes in the same request, so the list needs no second query; the hint is needed because quotes also references bookings.
const LIST_COLUMNS = `${ROW_COLUMNS}, quote:quotes!bookings_id_current_quote_id_fkey(total_paisa)`;
/** The most rows the unfiltered-by-month list returns. */
const LIST_LIMIT = 200;

type BookingRow = {
  id: string;
  reference: string;
  status: (typeof STATUSES)[number];
  event_date: string;
  guests: number;
  event_type_name: string;
  package_name: string | null;
  addon_names: string[];
  current_quote_id: string | null;
  slot: { name: string };
  hall: { name: string } | null;
  customer: { name: string; phone_e164: string };
};

type ListedBooking = BookingRow & { quote: { total_paisa: number } | null };

const isTransitionError = (e: { code?: string; message: string } | null) =>
  e?.code === RAISED && e.message.startsWith("invalid_transition");

async function venueZone(db: SupabaseClient, tenantId: string): Promise<string> {
  return check(await db.from("tenants").select("time_zone").eq("id", tenantId).single<{ time_zone: string }>(), "tenants").time_zone;
}
const todayAt = async (db: SupabaseClient, tenantId: string) => todayIn(await venueZone(db, tenantId));

/** Today in the venue's time zone (YYYY-MM-DD), for the staff calendar's default month. */
export async function venueToday(tenantId: string): Promise<string> {
  await requirePerm(tenantId, "bookings.view");
  return todayAt(await createServerClient(), tenantId);
}

function toRow(b: BookingRow, totalPaisa: number | null, today: string): StaffBookingRow {
  return {
    id: b.id,
    reference: b.reference,
    status: b.status === "requested" && b.event_date < today ? "expired" : b.status,
    eventDate: b.event_date,
    slot: b.slot.name,
    hall: b.hall?.name ?? null,
    customerName: b.customer.name,
    customerPhone: b.customer.phone_e164,
    guests: b.guests,
    eventType: b.event_type_name,
    totalPaisa,
  };
}

export async function listBookings(tenantId: string, q: { month?: string; status?: string }): Promise<{ rows: StaffBookingRow[]; more: boolean }> {
  await requirePerm(tenantId, "bookings.view");
  const { month, status } = ListQuery.parse(q);
  const db = await createServerClient();
  let query = db.from("bookings").select(LIST_COLUMNS).eq("tenant_id", tenantId);
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    query = query.gte("event_date", `${month}-01`).lt("event_date", `${next}-01`);
  }
  const today = await todayAt(db, tenantId);
  // "requested" means still waiting, as countNewRequests counts it; a passed request is "expired" (as toRow labels it).
  if (status === "expired") query = query.eq("status", "requested").lt("event_date", today);
  else if (status === "requested") query = query.eq("status", "requested").gte("event_date", today);
  else if (status) query = query.eq("status", status);
  query = query.order("event_date").order("created_at");
  // shortcut: the list stops at LIST_LIMIT rows (the calendar's month is never capped); upgrade to real pagination in the M6 bookings table.
  if (!month) query = query.limit(LIST_LIMIT + 1);
  const bookings = check(await query.returns<ListedBooking[]>(), "bookings");
  const more = !month && bookings.length > LIST_LIMIT;
  return { rows: (more ? bookings.slice(0, LIST_LIMIT) : bookings).map((b) => toRow(b, b.quote?.total_paisa ?? null, today)), more };
}

export async function getBookingDetail(tenantId: string, id: string): Promise<StaffBookingDetail | null> {
  await requirePerm(tenantId, "bookings.view");
  if (!Uuid.safeParse(id).success) return null;
  const db = await createServerClient();
  const [booking, history, timeZone] = await Promise.all([
    db.from("bookings").select(ROW_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<BookingRow>(),
    db
      .from("booking_status_history")
      .select("from_status, to_status, at, reason")
      .eq("tenant_id", tenantId)
      .eq("booking_id", id)
      .order("at")
      .order("id")
      .returns<{ from_status: string | null; to_status: string; at: string; reason: string | null }[]>(),
    venueZone(db, tenantId),
  ]);
  const b = check(booking, "bookings");
  if (!b) return null;
  const q = b.current_quote_id
    ? check(
        await db
          .from("quotes")
          .select("snapshot, total_paisa, advance_paisa")
          .eq("tenant_id", tenantId)
          .eq("id", b.current_quote_id)
          .single<{ snapshot: QuoteSnapshot; total_paisa: number; advance_paisa: number }>(),
        "quotes",
      )
    : null;
  return {
    ...toRow(b, q?.total_paisa ?? null, todayIn(timeZone)),
    packageName: b.package_name,
    addons: b.addon_names,
    history: check(history, "booking_status_history").map((h) => ({ from: h.from_status, to: h.to_status, at: h.at, reason: h.reason })),
    quote: q && storedQuote(q.snapshot, q.total_paisa, q.advance_paisa),
    override: q && quoteOverride(q.snapshot),
    timeZone,
  };
}

/** Requests still waiting on staff, for the overview badge. Past requests are expired, so they are not counted. */
export async function countNewRequests(tenantId: string): Promise<number> {
  await requirePerm(tenantId, "bookings.view");
  const db = await createServerClient();
  const { count, error } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "requested")
    .gte("event_date", await todayAt(db, tenantId));
  if (error) throw new Error(`bookings: ${error.message}`);
  return count ?? 0;
}

type PricingBooking = {
  status: string;
  event_date: string;
  guests: number;
  event_type_id: string | null;
  package_id: string | null;
  package_name: string | null;
  addon_ids: string[];
  addon_names: string[];
};
type PricingHall = { name: string; capacity_min: number; capacity_max: number; is_active: boolean; hire_price_paisa: number | null };

/**
 * The calculated quote for confirming a booking in a hall, from live catalogue prices and the names snapshotted on the
 * booking. A package or add-on removed since the request (package_id set null, add-on row gone) is left out and named
 * in `missing`, so the manager sees the gap in the preview and can override. Null when the booking or hall is not this venue's.
 */
async function calculate(db: SupabaseClient, tenantId: string, id: string, hallId: string) {
  const [booking, hall, tenant, settings] = await Promise.all([
    db
      .from("bookings")
      .select("status, event_date, guests, event_type_id, package_id, package_name, addon_ids, addon_names")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle<PricingBooking>(),
    db
      .from("halls")
      .select("name, capacity_min, capacity_max, is_active, hire_price_paisa")
      .eq("tenant_id", tenantId)
      .eq("id", hallId)
      .maybeSingle<PricingHall>(),
    db.from("tenants").select("time_zone").eq("id", tenantId).single<{ time_zone: string }>(),
    db.from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).single<{ money_rules: unknown }>(),
  ]);
  const b = check(booking, "bookings");
  const h = check(hall, "halls");
  if (!b || !h) return null;
  const rules = MoneyRulesSchema.parse(check(settings, "tenant_settings").money_rules);
  const [pkg, addons, datePrice] = await Promise.all([
    b.package_id
      ? db.from("packages").select("price_per_guest_paisa, min_guests").eq("tenant_id", tenantId).eq("id", b.package_id).maybeSingle<{ price_per_guest_paisa: number; min_guests: number }>()
      : null,
    b.addon_ids.length
      ? db.from("addons").select("id, price_paisa, basis").eq("tenant_id", tenantId).in("id", b.addon_ids).returns<{ id: string; price_paisa: number; basis: "flat" | "per_guest" }[]>()
      : null,
    datePriceFor(db, tenantId, b.event_date, b.event_type_id),
  ]);
  const p = pkg && check(pkg, "packages");
  const live = new Map((addons ? check(addons, "addons") : []).map((a) => [a.id, a]));
  const missing = [
    ...(b.package_name && !p ? [b.package_name] : []),
    ...b.addon_names.filter((_, i) => !live.has(b.addon_ids[i])),
  ];
  const inputs: PriceInput = {
    guests: b.guests,
    pkg: p ? { name: b.package_name ?? "", pricePerGuestPaisa: p.price_per_guest_paisa, minGuests: p.min_guests } : null,
    addons: b.addon_ids.flatMap((addonId, i) => {
      const a = live.get(addonId);
      return a ? [{ name: b.addon_names[i], pricePaisa: a.price_paisa, basis: a.basis }] : [];
    }),
    hall: { name: h.name, hirePricePaisa: h.hire_price_paisa },
    datePrice: datePrice && { label: datePrice.label, kind: datePrice.kind, value: datePrice.value },
    taxPercent: rules.taxPercent,
    advancePercent: rules.advancePercent,
  };
  return { booking: b, hall: h, rules, inputs, missing, quote: priceQuote(inputs), today: todayIn(check(tenant, "tenants").time_zone) };
}

export type QuotePreview = Quote & {
  /** Snapshot names of the booking's package or add-ons no longer in the catalogue: their price is not in the total. */
  missing: string[];
};

/** The quote the confirm form shows for this hall. Null when the booking or hall is not this venue's. */
export async function previewQuote(tenantId: string, id: string, hallId: string): Promise<QuotePreview | null> {
  await requirePerm(tenantId, "bookings.edit");
  if (!Uuid.safeParse(id).success || !Uuid.safeParse(hallId).success) return null;
  const c = await calculate(createServiceClient(), tenantId, id, hallId);
  return c && { ...c.quote, missing: c.missing };
}

/**
 * Confirms a request in a hall at the calculated price, or at a different total with quotes.override and a reason.
 * One SQL call writes quote v1 and the booking together; a clash with another confirmed booking is `slotTaken`.
 */
export async function confirmBooking(
  tenantId: string,
  id: string,
  input: { hallId: string; finalTotalRupees?: string; reason?: string; previewedTotalPaisa?: string },
): Promise<ConfirmResult> {
  const viewer = await requirePerm(tenantId, "bookings.edit");
  const parsed = ConfirmInput.safeParse(input);
  if (!parsed.success || !Uuid.safeParse(id).success) return { error: "invalid" };
  const { hallId, finalTotalRupees, reason, previewedTotalPaisa } = parsed.data;
  const db = createServiceClient();
  const c = await calculate(db, tenantId, id, hallId);
  if (!c) return { error: "notFound" };
  // A past request is expired to the customer, so it cannot be confirmed; it can still be declined or cancelled.
  if (c.booking.status !== "requested" || c.booking.event_date < c.today) return { error: "state" };
  const { hall, booking } = c;
  if (!hall.is_active || booking.guests < hall.capacity_min || booking.guests > hall.capacity_max) return { error: "capacity" };

  // The manager confirms the calculated total they were shown; a catalogue or date-price change since then is not locked in unseen.
  // A missing or garbled previewed total counts as changed.
  if (!/^-?\d{1,15}$/.test(previewedTotalPaisa ?? "") || Number(previewedTotalPaisa) !== c.quote.totalPaisa) return { error: "priceChanged" };

  let quote: Quote = c.quote;
  let override: { calculatedTotalPaisa: number; reason: string } | null = null;
  const raw = finalTotalRupees?.trim();
  if (raw) {
    const finalPaisa = parseRupees(raw);
    if (finalPaisa === null) return { error: "invalid" };
    if (finalPaisa !== c.quote.totalPaisa) {
      if (!can(viewer, tenantId, "quotes.override")) return { error: "forbidden" };
      const why = Reason.safeParse(reason ?? "");
      if (!why.success) return { error: "invalid" };
      quote = applyOverride(c.quote, finalPaisa, c.rules.taxPercent, c.rules.advancePercent);
      override = { calculatedTotalPaisa: c.quote.totalPaisa, reason: why.data };
    }
  }
  // total_paisa and advance_paisa are int4: a negative or too large total would fail inside the RPC.
  if (quote.totalPaisa < 0 || quote.totalPaisa > MAX_INT4 || quote.advancePaisa < 0 || quote.advancePaisa > MAX_INT4) return { error: "outOfRange" };
  const snapshot = snapshotOf(quote, c.inputs, override);
  const { error } = await db.rpc("confirm_booking", {
    p_booking: id,
    p_hall: hallId,
    p_snapshot: snapshot,
    p_total: quote.totalPaisa,
    p_advance: quote.advancePaisa,
    p_advance_due_on: addDays(c.today, c.rules.advanceDueDays),
    p_actor: viewer.userId,
  });
  if (error?.code === EXCLUSION) return { error: "slotTaken" };
  if (isTransitionError(error)) return { error: "state" };
  if (error) throw new Error(`confirm_booking: ${error.message}`);
  await recordAuditAfterCommit({
    tenantId,
    action: "booking.confirm",
    entity: "booking",
    entityId: id,
    after: { hallId, calculatedTotalPaisa: snapshot.calculatedTotalPaisa, finalTotalPaisa: snapshot.finalTotalPaisa },
    reason: override?.reason,
  });
  return { ok: true };
}

async function setStatus(
  tenantId: string,
  id: string,
  reason: string,
  change: { to: "declined" } | { to: "cancelled"; refundDue?: boolean },
): Promise<StatusResult> {
  const viewer = await requirePerm(tenantId, "bookings.edit");
  const why = Reason.safeParse(reason);
  if (!why.success || !Uuid.safeParse(id).success) return { error: "invalid" };
  const db = createServiceClient();
  const found = check(await db.from("bookings").select("status").eq("tenant_id", tenantId).eq("id", id).maybeSingle<{ status: string }>(), "bookings");
  if (!found) return { error: "notFound" };
  const { to, ...choice } = change;
  const fn = to === "declined" ? "decline_booking" : "cancel_booking";
  const refund = "refundDue" in choice ? { p_refund_due: choice.refundDue ?? null } : {};
  const { error } = await db.rpc(fn, { p_booking: id, p_reason: why.data, ...refund, p_actor: viewer.userId });
  if (isTransitionError(error)) return { error: "state" };
  if (error?.code === RAISED && error.message === "refund_choice_required") return { error: "refundChoice" };
  if (error) throw new Error(`${fn}: ${error.message}`);
  await recordAuditAfterCommit({
    tenantId,
    action: to === "declined" ? "booking.decline" : "booking.cancel",
    entity: "booking",
    entityId: id,
    before: { status: found.status },
    after: { status: to, ...choice },
    reason: why.data,
  });
  return { ok: true };
}

/** Declines a request. The reason (3 to 300 characters) is for staff only. */
export const declineBooking = (tenantId: string, id: string, reason: string) => setStatus(tenantId, id, reason, { to: "declined" });

/**
 * Cancels a request, a hold or a confirmed booking. The reason (3 to 300 characters) is for staff only. With money paid,
 * `refundDue` is required: true owes it back, false keeps it; without it the answer is `refundChoice`.
 */
export const cancelBooking = (tenantId: string, id: string, reason: string, refundDue?: boolean) =>
  setStatus(tenantId, id, reason, { to: "cancelled", refundDue });
