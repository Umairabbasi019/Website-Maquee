import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/modules/access";
import { getPublicCatalogue } from "@/modules/catalogue";
import { MoneyRulesSchema } from "@/modules/tenants/client";
import { pickDatePrice, priceQuote, type PriceInput, type Quote, type QuoteSnapshot } from "../pricing";
import { BookingRequestSchema, EstimateSchema, inBookingWindow, lastBookingDay, todayIn } from "../request";

// Public requests have no session: the caller resolves the tenant from the host, and every read here goes through
// the service client filtered by that tenant. Nothing here reads bookings, so a taken date looks like a free one; only in
// quick booking mode does `held` tell the customer a hall was free (the spec's "the manager will reply" fallback).

/** Postgres raise_exception: create_booking_request's rate limit. */
const RAISED = "P0001";
const TOKEN_DAYS = 60;
/** The largest value of the int4 total and advance columns. */
export const MAX_INT4 = 2_147_483_647;
const DEV_SECRET = "dev-only-booking-hash-secret";
let warned = false;

function hashSecret(): string {
  const secret = process.env.BOOKING_HASH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("Missing environment variable BOOKING_HASH_SECRET");
  if (!warned) console.warn("BOOKING_HASH_SECRET is not set; using a fixed development value.");
  warned = true;
  return DEV_SECRET;
}

/** HMAC-SHA256 hex of a rate-limit key (the request IP, a phone), so neither is stored in clear. */
export const hashKey = (value: string): string => createHmac("sha256", hashSecret()).update(value).digest("hex");

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Throws on error; the return type drops the failure variant, so `single()` gives non-null data and `maybeSingle()` may be null. */
export function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

type Choice = { date: string; eventTypeId: string; guests: number; packageId?: string; addonIds: string[] };

type Hall = { id: string; name: string; capacity_min: number; capacity_max: number; hire_price_paisa: number | null };

/** The venue row, its money rules, its active halls (by name, the order quick booking tries them) and the guest cap (the largest). */
async function readVenue(db: SupabaseClient, tenantId: string) {
  const [tenant, settings, halls] = await Promise.all([
    db.from("tenants").select("slug, time_zone, status").eq("id", tenantId).single<{ slug: string; time_zone: string; status: string }>(),
    db.from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).single<{ money_rules: unknown }>(),
    // shortcut: halls have no sort column, so quick booking tries them by name; add halls.sort_order if venues need to choose.
    db
      .from("halls")
      .select("id, name, capacity_min, capacity_max, hire_price_paisa")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name")
      .returns<Hall[]>(),
  ]);
  const active = check(halls, "halls");
  return {
    venue: check(tenant, "tenants"),
    rules: MoneyRulesSchema.parse(check(settings, "tenant_settings").money_rules),
    halls: active,
    maxGuests: Math.max(0, ...active.map((h) => h.capacity_max)),
  };
}

/** What the public form offers beyond the catalogue: slots, the guest cap, the date range and whether to show the estimate. */
export async function getRequestOptions(tenantId: string) {
  const db = createServiceClient();
  const [{ venue, rules, maxGuests }, slots] = await Promise.all([
    readVenue(db, tenantId),
    db.from("slots").select("id, name").eq("tenant_id", tenantId).order("start_time").returns<{ id: string; name: string }[]>(),
  ]);
  const today = todayIn(venue.time_zone);
  return { slots: check(slots, "slots"), maxGuests, today, lastDay: lastBookingDay(today), showEstimate: rules.showPriceEstimate };
}

/**
 * The venue's own active rows for the chosen ids, or `fields`: the form fields to mark when a choice is refused
 * (empty when the refusal is not about one field, like a venue that is not live).
 */
async function resolveChoice(db: SupabaseClient, tenantId: string, c: Choice) {
  const [{ venue, rules, halls, maxGuests }, catalogue] = await Promise.all([readVenue(db, tenantId), getPublicCatalogue(tenantId)]);
  // Only a live venue takes requests: setup is a preview, paused is closed.
  if (venue.status !== "live" || !inBookingWindow(c.date, todayIn(venue.time_zone))) return { ok: false as const, fields: [] };

  const eventType = catalogue.events.find((e) => e.id === c.eventTypeId);
  const pkg = c.packageId ? eventType?.packages.find((p) => p.id === c.packageId) : null;
  const addonIds = [...new Set(c.addonIds)];
  const addons = catalogue.addons.filter((a) => addonIds.includes(a.id));
  // A package can only be wrong when its event type is right.
  const fields = [
    ...(c.guests > maxGuests ? ["guests"] : []),
    ...(!eventType ? ["eventTypeId"] : pkg === undefined ? ["packageId"] : []),
  ];
  if (fields.length || !eventType || addons.length !== addonIds.length) return { ok: false as const, fields };
  return { ok: true as const, venue, rules, halls, eventType, pkg, addons };
}

/** The date price row for this date and event type (null id: only the all-events row applies). */
export async function datePriceFor(db: SupabaseClient, tenantId: string, date: string, eventTypeId: string | null) {
  const rows = check(
    await db
      .from("date_prices")
      .select("event_type_id, kind, value, label")
      .eq("tenant_id", tenantId)
      .lte("starts_on", date)
      .gte("ends_on", date)
      .returns<{ event_type_id: string | null; kind: "percent" | "per_guest"; value: number; label: string }[]>(),
    "date_prices",
  );
  const matches = rows.map((r) => ({ eventTypeId: r.event_type_id, kind: r.kind, value: r.value, label: r.label }));
  // An unknown id matches no event-specific row, so only the all-events row is left.
  return pickDatePrice(matches, eventTypeId ?? "");
}

/** The customer's price estimate: no hall hire, since no hall is chosen. Null when the venue hides it or there is no package. */
export async function estimateFor(tenantId: string, input: unknown): Promise<Quote | null> {
  const parsed = EstimateSchema.safeParse(input);
  if (!parsed.success) return null;
  const db = createServiceClient();
  const choice = await resolveChoice(db, tenantId, parsed.data);
  if (!choice.ok || !choice.rules.showPriceEstimate || !choice.pkg) return null;
  const { date, eventTypeId, guests } = parsed.data;
  return priceQuote({
    guests,
    pkg: choice.pkg,
    addons: choice.addons,
    hall: null,
    datePrice: await datePriceFor(db, tenantId, date, eventTypeId),
    taxPercent: choice.rules.taxPercent,
    advancePercent: choice.rules.advancePercent,
  });
}

/**
 * Quick booking's halls to try: each active hall the guests fit, priced at the standard package price (no override).
 * A hall whose total does not fit the int4 columns (or is negative) is left out, so that booking falls back to a request.
 */
async function quickCandidates(
  db: SupabaseClient,
  tenantId: string,
  r: { date: string; eventTypeId: string; guests: number },
  choice: Extract<Awaited<ReturnType<typeof resolveChoice>>, { ok: true }>,
  pkg: NonNullable<typeof choice.pkg>,
) {
  const datePrice = await datePriceFor(db, tenantId, r.date, r.eventTypeId);
  return choice.halls
    .filter((h) => r.guests >= h.capacity_min && r.guests <= h.capacity_max)
    .flatMap((h) => {
      const inputs: PriceInput = {
        guests: r.guests,
        pkg: { name: pkg.name, pricePerGuestPaisa: pkg.pricePerGuestPaisa, minGuests: pkg.minGuests },
        addons: choice.addons.map((a) => ({ name: a.name, pricePaisa: a.pricePaisa, basis: a.basis })),
        hall: { name: h.name, hirePricePaisa: h.hire_price_paisa },
        datePrice: datePrice && { label: datePrice.label, kind: datePrice.kind, value: datePrice.value },
        taxPercent: choice.rules.taxPercent,
        advancePercent: choice.rules.advancePercent,
      };
      const q = priceQuote(inputs);
      if (q.totalPaisa < 0 || q.totalPaisa > MAX_INT4) return [];
      const snapshot: QuoteSnapshot = {
        lines: q.lines,
        subtotalPaisa: q.subtotalPaisa,
        taxPaisa: q.taxPaisa,
        advancePaisa: q.advancePaisa,
        calculatedTotalPaisa: q.totalPaisa,
        finalTotalPaisa: q.totalPaisa,
        overrideReason: null,
        inputs,
      };
      return [{ hall: h.id, snapshot, total: q.totalPaisa, advance: q.advancePaisa }];
    });
}

/**
 * Saves a public booking request. `ipHash` is hashKey(request IP). The token is returned once and only its hash is stored.
 * In quick booking mode (instantBooking, an advance above 0 and a package) the booking holds the first free hall at
 * once (`held`); with none free it stays a request. The answer has the same shape either way.
 */
export async function createBookingRequest(
  tenantId: string,
  input: unknown,
  ipHash: string,
): Promise<{ ok: true; reference: string; token: string; held: boolean } | { error: "limited" } | { error: "invalid"; fields?: string[] }> {
  const parsed = BookingRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const r = parsed.data;
  const db = createServiceClient();
  const [choice, slot] = await Promise.all([
    resolveChoice(db, tenantId, r),
    db.from("slots").select("id").eq("tenant_id", tenantId).eq("id", r.slotId).maybeSingle(),
  ]);
  if (!choice.ok) return { error: "invalid", ...(choice.fields.length && { fields: choice.fields }) };
  if (!check(slot, "slots")) return { error: "invalid" };

  const token = randomBytes(32).toString("base64url");
  // shortcut: expiry counts from UTC midnight, up to 5 hours off venue-local midnight; use the venue time zone if links must end exactly.
  const expires = new Date(Date.parse(`${r.date}T00:00:00Z`) + TOKEN_DAYS * 86_400_000);
  const args = {
    p_tenant: tenantId,
    p_customer: { name: r.name, phone_e164: r.phone, whatsapp_consent: r.whatsappConsent },
    p_booking: {
      event_date: r.date,
      slot_id: r.slotId,
      event_type_id: choice.eventType.id,
      event_type_name: choice.eventType.name,
      package_id: choice.pkg?.id ?? null,
      package_name: choice.pkg?.name ?? null,
      addon_ids: choice.addons.map((a) => a.id),
      addon_names: choice.addons.map((a) => a.name),
      guests: r.guests,
    },
    p_token_hash: sha256Hex(token),
    p_expires: expires.toISOString(),
    p_key_hashes: [hashKey(r.phone), ipHash],
  };
  const { pkg, rules } = choice;
  // Quick booking's package, or null in request mode.
  const quick = rules.instantBooking && rules.advancePercent > 0 ? pkg : null;
  const fn = quick ? "create_quick_booking" : "create_booking_request";
  const { data, error } = await db.rpc(
    fn,
    quick
      ? {
          ...args,
          p_candidates: await quickCandidates(db, tenantId, r, choice, quick),
          p_hold_until: new Date(Date.now() + rules.holdHours * 3_600_000).toISOString(),
        }
      : args,
  );
  if (error?.code === RAISED && error.message === "rate_limited") return { error: "limited" };
  if (error) throw new Error(`${fn}: ${error.message}`);
  const saved: { reference: string; held: boolean } = quick ? data : { reference: data, held: false };
  return { ok: true, reference: saved.reference, token, held: saved.held };
}
