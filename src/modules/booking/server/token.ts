import "server-only";
import { createServiceClient } from "@/modules/access";
import { customerQuote, type Quote, type QuoteSnapshot } from "../pricing";
import { todayIn } from "../request";
import { check, sha256Hex } from "./request";

/** What the private link shows. Never the phone, and never a decline or cancel reason (those are staff-only). */
export type CustomerBookingView = {
  id: string;
  reference: string;
  /** Stored status; "expired" for a request whose date has passed, "hold_expired" for a hold past its time. */
  status: "requested" | "awaiting_advance" | "confirmed" | "hold_expired" | "refund_pending" | "refunded" | "declined" | "cancelled" | "expired";
  eventDate: string;
  slot: string;
  eventType: string;
  guests: number;
  packageName: string | null;
  addons: string[];
  hall: string | null;
  quote: Quote | null;
  /** When the hold ends or ended (ISO timestamp); null for a booking never held. */
  holdExpiresAt: string | null;
  /** The advance due date of a confirmed booking (YYYY-MM-DD), if set. */
  advanceDueOn: string | null;
  venueName: string;
};

type BookingRow = {
  id: string;
  reference: string;
  status: Exclude<CustomerBookingView["status"], "expired">;
  event_date: string;
  slot_id: string;
  event_type_name: string;
  package_name: string | null;
  addon_names: string[];
  guests: number;
  hall_id: string | null;
  current_quote_id: string | null;
  hold_expires_at: string | null;
  advance_due_on: string | null;
};

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The statuses whose price the customer sees: a booking with a hall and a quote it is paying towards.
const PRICED = new Set<string>(["awaiting_advance", "confirmed", "hold_expired", "refund_pending"]);

/**
 * The booking a private link opens, only on its own venue's host (`tenantId` from the host, never the browser).
 * Unknown, expired, revoked and other-venue tokens all give null, so none can be told apart.
 */
export async function resolveBookingToken(token: string, tenantId: string): Promise<{ bookingId: string } | null> {
  if (!TOKEN.test(token)) return null;
  const access = check(
    await createServiceClient()
      .from("access_tokens")
      .select("target_id")
      .eq("token_hash", sha256Hex(token))
      .eq("tenant_id", tenantId)
      .eq("kind", "booking")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ target_id: string }>(),
    "access_tokens",
  );
  return access && { bookingId: access.target_id };
}

/** What the private link shows; null wherever resolveBookingToken is. */
export async function getBookingByToken(token: string, tenantId: string): Promise<CustomerBookingView | null> {
  const access = await resolveBookingToken(token, tenantId);
  if (!access) return null;
  const db = createServiceClient();
  const b = check(
    await db
      .from("bookings")
      .select(
        "id, reference, status, event_date, slot_id, event_type_name, package_name, addon_names, guests, hall_id, current_quote_id, hold_expires_at, advance_due_on",
      )
      .eq("tenant_id", tenantId)
      .eq("id", access.bookingId)
      .maybeSingle<BookingRow>(),
    "bookings",
  );
  if (!b) return null;

  const priced = PRICED.has(b.status) && b.current_quote_id;
  const [tenant, slot, hall, quote] = await Promise.all([
    db.from("tenants").select("name, time_zone").eq("id", tenantId).single<{ name: string; time_zone: string }>(),
    db.from("slots").select("name").eq("tenant_id", tenantId).eq("id", b.slot_id).single<{ name: string }>(),
    b.hall_id ? db.from("halls").select("name").eq("tenant_id", tenantId).eq("id", b.hall_id).single<{ name: string }>() : null,
    priced
      ? db
          .from("quotes")
          .select("snapshot, total_paisa, advance_paisa")
          .eq("tenant_id", tenantId)
          .eq("id", b.current_quote_id)
          .single<{ snapshot: QuoteSnapshot; total_paisa: number; advance_paisa: number }>()
      : null,
  ]);
  const venue = check(tenant, "tenants");
  const q = quote && check(quote, "quotes");
  // Read only: a hold past its time shows as expired, though the row changes only when another booking needs the slot.
  const status =
    b.status === "requested" && b.event_date < todayIn(venue.time_zone)
      ? "expired"
      : b.status === "awaiting_advance" && Date.parse(b.hold_expires_at!) < Date.now()
        ? "hold_expired"
        : b.status;
  return {
    id: b.id,
    reference: b.reference,
    status,
    eventDate: b.event_date,
    slot: check(slot, "slots").name,
    eventType: b.event_type_name,
    guests: b.guests,
    packageName: b.package_name,
    addons: b.addon_names,
    hall: (hall && check(hall, "halls"))?.name ?? null,
    quote: q && customerQuote(q.snapshot, q.total_paisa, q.advance_paisa),
    holdExpiresAt: b.hold_expires_at,
    advanceDueOn: b.advance_due_on,
    venueName: venue.name,
  };
}
