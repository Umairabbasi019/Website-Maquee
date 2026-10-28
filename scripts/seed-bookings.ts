import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
// Relative on purpose, like seed-site.ts: the module indexes pull in server-only and React code.
import { priceQuote, snapshotOf, type PriceInput } from "../src/modules/booking/pricing";
import { MoneyRulesSchema } from "../src/modules/tenants/settings";
import { assertLocalSupabaseUrl } from "./local-guard";

process.loadEnvFile(".env.local");

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
assertLocalSupabaseUrl(url);
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

// Far from the dates the e2e specs book (about 30 and 45 days out), so they never collide with these rows.
// Phones are not the e2e ones (+92300555100x). A phone that already exists means the sample rows are there.
// shortcut: a run that fails part way leaves customers without all bookings and later runs skip; db:seed resets first, so check bookings too if this ever runs without a reset.
const SAMPLES = [
  { name: "Sample Customer A", phone: "+923001110001", days: 95, event: "barat", slot: "Dinner", guests: 300, confirm: false },
  { name: "Sample Customer B", phone: "+923001110002", days: 100, event: "valima", slot: "Lunch", guests: 200, confirm: false },
  { name: "Sample Customer C", phone: "+923001110003", days: 90, event: "barat", slot: "Dinner", guests: 300, confirm: true },
];

const dayInZone = (days: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(Date.now() + days * 86_400_000));

async function main() {
  const tenant = check(await admin.from("tenants").select("id, time_zone").eq("slug", "manor").single(), "tenant manor");
  const existing = check(
    await admin.from("customers").select("id").eq("tenant_id", tenant.id).in("phone_e164", SAMPLES.map((s) => s.phone)),
    "sample customers",
  );
  if (existing.length) {
    console.log("sample bookings for manor already exist, skipped");
    return;
  }
  const [events, slots, halls, settings] = await Promise.all([
    admin.from("event_types").select("id, slug, name").eq("tenant_id", tenant.id),
    admin.from("slots").select("id, name").eq("tenant_id", tenant.id),
    admin.from("halls").select("id, name, capacity_min, capacity_max, hire_price_paisa").eq("tenant_id", tenant.id).eq("is_active", true),
    admin.from("tenant_settings").select("money_rules").eq("tenant_id", tenant.id).single(),
  ]);
  const rules = MoneyRulesSchema.parse(check(settings, "settings").money_rules);

  for (const s of SAMPLES) {
    const event = check(events, "event types").find((e) => e.slug === s.event);
    const slot = check(slots, "slots").find((x) => x.name === s.slot);
    if (!event || !slot) throw new Error(`manor has no ${s.event} event type or ${s.slot} slot; seed the catalogue first`);
    const pkg = check(
      await admin.from("packages").select("id, name, price_per_guest_paisa, min_guests").eq("tenant_id", tenant.id).eq("event_type_id", event.id).order("sort").limit(1).maybeSingle(),
      "package",
    );
    const reference = check(
      await admin.rpc("create_booking_request", {
        p_tenant: tenant.id,
        p_customer: { name: s.name, phone_e164: s.phone, whatsapp_consent: true },
        p_booking: {
          event_date: dayInZone(s.days, tenant.time_zone),
          slot_id: slot.id,
          event_type_id: event.id,
          event_type_name: event.name,
          package_id: pkg?.id ?? null,
          package_name: pkg?.name ?? null,
          addon_ids: [],
          addon_names: [],
          guests: s.guests,
        },
        p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        p_expires: new Date(Date.now() + (s.days + 60) * 86_400_000).toISOString(),
        p_key_hashes: [], // no rate-limit hits for seed rows
      }),
      `request ${s.name}`,
    );
    if (!s.confirm) {
      console.log(`requested ${reference}`);
      continue;
    }
    const hall = check(halls, "halls").find((h) => s.guests >= h.capacity_min && s.guests <= h.capacity_max);
    if (!hall) throw new Error(`manor has no active hall for ${s.guests} guests`);
    const inputs: PriceInput = {
      guests: s.guests,
      pkg: pkg && { name: pkg.name, pricePerGuestPaisa: pkg.price_per_guest_paisa, minGuests: pkg.min_guests },
      addons: [],
      hall: { name: hall.name, hirePricePaisa: hall.hire_price_paisa },
      datePrice: null,
      taxPercent: rules.taxPercent,
      advancePercent: rules.advancePercent,
    };
    const quote = priceQuote(inputs);
    const booking = check(await admin.from("bookings").select("id").eq("tenant_id", tenant.id).eq("reference", reference).single(), "booking");
    check(
      await admin.rpc("confirm_booking", {
        p_booking: booking.id,
        p_hall: hall.id,
        p_snapshot: snapshotOf(quote, inputs),
        p_total: quote.totalPaisa,
        p_advance: quote.advancePaisa,
        p_advance_due_on: dayInZone(rules.advanceDueDays, tenant.time_zone),
        p_actor: null,
      }),
      `confirm ${reference}`,
    );
    console.log(`confirmed ${reference}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
