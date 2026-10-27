import "server-only";
import { createServiceClient } from "@/modules/access";
import type { Quote } from "../pricing";
import { todayIn } from "../request";
import { sha256Hex } from "./request";

/** What the private link shows. Never the phone, and never a decline or cancel reason (those are staff-only). */
export type CustomerBookingView = {
  reference: string;
  status: "requested" | "confirmed" | "declined" | "cancelled" | "expired";
  eventDate: string;
  slot: string;
  eventType: string;
  guests: number;
  packageName: string | null;
  addons: string[];
  hall: string | null;
  quote: Quote | null;
  venueName: string;
};

type BookingRow = {
  reference: string;
  status: Exclude<CustomerBookingView["status"], "expired">;
  event_date: string;
  slot_id: string;
  event_type_name: string;
  package_name: string | null;
  addon_ids: string[];
  guests: number;
  hall_id: string | null;
  current_quote_id: string | null;
};

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function check<T>(r: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** The booking a private link opens. Unknown, expired and revoked tokens all give null, so none can be told apart. */
export async function getBookingByToken(token: string): Promise<CustomerBookingView | null> {
  if (!TOKEN.test(token)) return null;
  const db = createServiceClient();
  const access = check(
    await db
      .from("access_tokens")
      .select("tenant_id, target_id")
      .eq("token_hash", sha256Hex(token))
      .eq("kind", "booking")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ tenant_id: string; target_id: string }>(),
    "access_tokens",
  );
  if (!access) return null;
  const t = access.tenant_id;
  const b = check(
    await db
      .from("bookings")
      .select("reference, status, event_date, slot_id, event_type_name, package_name, addon_ids, guests, hall_id, current_quote_id")
      .eq("tenant_id", t)
      .eq("id", access.target_id)
      .maybeSingle<BookingRow>(),
    "bookings",
  );
  if (!b) return null;

  const confirmed = b.status === "confirmed" && b.current_quote_id;
  const [tenant, slot, hall, addons, quote] = await Promise.all([
    db.from("tenants").select("name, time_zone").eq("id", t).single<{ name: string; time_zone: string }>(),
    db.from("slots").select("name").eq("tenant_id", t).eq("id", b.slot_id).single<{ name: string }>(),
    b.hall_id ? db.from("halls").select("name").eq("tenant_id", t).eq("id", b.hall_id).single<{ name: string }>() : null,
    // shortcut: an add-on removed by Publish drops out of this list; read names from the quote snapshot once M5 needs them.
    b.addon_ids.length ? db.from("addons").select("name").eq("tenant_id", t).in("id", b.addon_ids).returns<{ name: string }[]>() : null,
    confirmed
      ? db
          .from("quotes")
          .select("snapshot, total_paisa, advance_paisa")
          .eq("tenant_id", t)
          .eq("id", b.current_quote_id)
          .single<{ snapshot: Quote; total_paisa: number; advance_paisa: number }>()
      : null,
  ]);
  const venue = check(tenant, "tenants")!;
  const q = quote && check(quote, "quotes");
  return {
    reference: b.reference,
    status: b.status === "requested" && b.event_date < todayIn(venue.time_zone) ? "expired" : b.status,
    eventDate: b.event_date,
    slot: check(slot, "slots")!.name,
    eventType: b.event_type_name,
    guests: b.guests,
    packageName: b.package_name,
    addons: (addons && check(addons, "addons"))?.map((a) => a.name) ?? [],
    hall: (hall && check(hall, "halls"))?.name ?? null,
    // Stored totals, not re-summed lines: after an override the lines no longer add up to the total.
    quote: q && {
      lines: q.snapshot.lines,
      subtotalPaisa: q.snapshot.subtotalPaisa,
      taxPaisa: q.snapshot.taxPaisa,
      totalPaisa: q.total_paisa,
      advancePaisa: q.advance_paisa,
    },
    venueName: venue.name,
  };
}
