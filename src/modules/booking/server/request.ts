import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/modules/access";
import { getPublicCatalogue } from "@/modules/catalogue";
import { MoneyRulesSchema } from "@/modules/tenants/client";
import { pickDatePrice, priceQuote, type Quote } from "../pricing";
import { BookingRequestSchema, EstimateSchema, inBookingWindow, lastBookingDay, todayIn } from "../request";

// Public requests have no session: the caller resolves the tenant from the host, and every read here goes through
// the service client filtered by that tenant. Nothing here reads bookings, so a taken date looks like a free one.

/** Postgres raise_exception: create_booking_request's rate limit. */
const RAISED = "P0001";
const TOKEN_DAYS = 60;
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

/** The venue row, its money rules and the guest cap (the largest active hall). */
async function readVenue(db: SupabaseClient, tenantId: string) {
  const [tenant, settings, halls] = await Promise.all([
    db.from("tenants").select("slug, time_zone, status").eq("id", tenantId).single<{ slug: string; time_zone: string; status: string }>(),
    db.from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).single<{ money_rules: unknown }>(),
    db.from("halls").select("capacity_max").eq("tenant_id", tenantId).eq("is_active", true).returns<{ capacity_max: number }[]>(),
  ]);
  return {
    venue: check(tenant, "tenants"),
    rules: MoneyRulesSchema.parse(check(settings, "tenant_settings").money_rules),
    maxGuests: Math.max(0, ...check(halls, "halls").map((h) => h.capacity_max)),
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

/** The venue's own active rows for the chosen ids, or null when any id is not one of them or a limit is broken. */
async function resolveChoice(db: SupabaseClient, tenantId: string, c: Choice) {
  const [{ venue, rules, maxGuests }, catalogue] = await Promise.all([readVenue(db, tenantId), getPublicCatalogue(tenantId)]);
  if (venue.status === "paused" || !inBookingWindow(c.date, todayIn(venue.time_zone)) || c.guests > maxGuests) return null;

  const eventType = catalogue.events.find((e) => e.id === c.eventTypeId);
  const pkg = c.packageId ? eventType?.packages.find((p) => p.id === c.packageId) : null;
  const addonIds = [...new Set(c.addonIds)];
  const addons = catalogue.addons.filter((a) => addonIds.includes(a.id));
  if (!eventType || pkg === undefined || addons.length !== addonIds.length) return null;
  return { venue, rules, eventType, pkg, addons };
}

/** The customer's price estimate: no hall hire, since no hall is chosen. Null when the venue hides it or there is no package. */
export async function estimateFor(tenantId: string, input: unknown): Promise<Quote | null> {
  const parsed = EstimateSchema.safeParse(input);
  if (!parsed.success) return null;
  const db = createServiceClient();
  const choice = await resolveChoice(db, tenantId, parsed.data);
  if (!choice?.rules.showPriceEstimate || !choice.pkg) return null;
  const { date, eventTypeId, guests } = parsed.data;
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
  const datePrice = pickDatePrice(
    rows.map((r) => ({ eventTypeId: r.event_type_id, kind: r.kind, value: r.value, label: r.label })),
    eventTypeId,
  );
  return priceQuote({
    guests,
    pkg: choice.pkg,
    addons: choice.addons,
    hall: null,
    datePrice,
    taxPercent: choice.rules.taxPercent,
    advancePercent: choice.rules.advancePercent,
  });
}

/** Saves a public booking request. `ipHash` is hashKey(request IP). The token is returned once and only its hash is stored. */
export async function createBookingRequest(
  tenantId: string,
  input: unknown,
  ipHash: string,
): Promise<{ ok: true; reference: string; token: string } | { error: "invalid" | "limited" }> {
  const parsed = BookingRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const r = parsed.data;
  const db = createServiceClient();
  const [choice, slot] = await Promise.all([
    resolveChoice(db, tenantId, r),
    db.from("slots").select("id").eq("tenant_id", tenantId).eq("id", r.slotId).maybeSingle(),
  ]);
  if (!choice || !check(slot, "slots")) return { error: "invalid" };

  const token = randomBytes(32).toString("base64url");
  // shortcut: expiry counts from UTC midnight, up to 5 hours off venue-local midnight; use the venue time zone if links must end exactly.
  const expires = new Date(Date.parse(`${r.date}T00:00:00Z`) + TOKEN_DAYS * 86_400_000);
  const { data, error } = await db.rpc("create_booking_request", {
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
  });
  if (error?.code === RAISED && error.message === "rate_limited") return { error: "limited" };
  if (error) throw new Error(`create_booking_request: ${error.message}`);
  return { ok: true, reference: data as string, token };
}
