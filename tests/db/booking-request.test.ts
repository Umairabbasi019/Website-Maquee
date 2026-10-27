import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBookingRequest, getBookingByToken } from "@/modules/booking";

// The functions use the service client on a separate connection, so this file commits a throwaway venue and
// deletes it afterwards instead of rolling back.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const one = async <T = string>(sql: string, params: unknown[] = []): Promise<T> =>
  Object.values((await pool.query(sql, params)).rows[0])[0] as T;

let tenant = "";
let slot = "";
let eventType = "";
let hall = "";
// Each request gets its own phone and IP unless a test shares them, so the rate limit only bites where meant.
let n = 0;
const fresh = () => String(++n).padStart(7, "0");
const date = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
const input = (phone = `0301${fresh()}`) => ({
  date,
  slotId: slot,
  eventTypeId: eventType,
  guests: 200,
  addonIds: [],
  name: "Sara",
  phone,
  whatsappConsent: false,
  website: "",
});

async function request(phone?: string, ip = `ip-${fresh()}`) {
  const r = await createBookingRequest(tenant, input(phone), ip);
  if (!("ok" in r)) throw new Error(`request refused: ${r.error}`);
  return r;
}

beforeAll(async () => {
  const account = await one("insert into accounts (name) values ('Booking test') returning id");
  tenant = await one("insert into tenants (account_id, slug, name, status) values ($1, $2, 'Zq Hall', 'live') returning id", [
    account,
    `zq-${randomUUID()}`,
  ]);
  await pool.query("insert into tenant_settings (tenant_id) values ($1) on conflict do nothing", [tenant]);
  hall = await one("insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  slot = await one("insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  eventType = await one("insert into event_types (tenant_id, slug, name) values ($1, 'barat', 'Barat') returning id", [tenant]);
});

afterAll(async () => {
  // Bookings first: their slot key is on delete restrict.
  await pool.query("delete from bookings where tenant_id = $1", [tenant]);
  await pool.query("delete from tenants where id = $1", [tenant]);
  await pool.end();
});

describe("create_booking_request", () => {
  it("gives references in the venue's month that increase by one", async () => {
    const a = await request();
    const b = await request();
    expect(a.reference).toMatch(/^[A-Z]{2}-\d{4}-\d{4}$/);
    expect(a.reference.slice(0, 7)).toBe(`ZQ-${await one("select to_char(now() at time zone 'Asia/Karachi', 'YYMM')")}`);
    expect(Number(b.reference.slice(-4))).toBe(Number(a.reference.slice(-4)) + 1);
  });

  it("refuses the sixth request in an hour from the same phone, and counts the IP the same way", async () => {
    const phone = `0302${fresh()}`;
    for (let i = 0; i < 5; i++) await request(phone);
    await expect(createBookingRequest(tenant, input(phone), `ip-${fresh()}`)).resolves.toEqual({ error: "limited" });
    const ip = `ip-${fresh()}`;
    for (let i = 0; i < 5; i++) await request(undefined, ip);
    await expect(createBookingRequest(tenant, input(), ip)).resolves.toEqual({ error: "limited" });
  });

  it("is not callable by anon or authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      const granted = await one<boolean>(
        "select has_function_privilege($1, 'public.create_booking_request(uuid, jsonb, jsonb, text, timestamptz, text[])', 'execute')",
        [role],
      );
      expect(granted).toBe(false);
    }
  });

  it("accepts a date that already has a confirmed booking, with the same result", async () => {
    const taken = await request();
    const b = await one("select id from bookings where tenant_id = $1 and reference = $2", [tenant, taken.reference]);
    const q = await one(
      "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 1, 1) returning id",
      [tenant, b],
    );
    await pool.query("update bookings set status = 'confirmed', hall_id = $2, during = tstzrange(now(), now() + interval '1 hour'), current_quote_id = $3 where id = $1", [
      b,
      hall,
      q,
    ]);
    const again = await request();
    expect(Object.keys(again).sort()).toEqual(Object.keys(taken).sort());
  });

  it("records the customer's request in history with no actor", async () => {
    const r = await request();
    const row = (
      await pool.query(
        "select h.from_status, h.to_status, h.actor from booking_status_history h join bookings b on b.id = h.booking_id where b.tenant_id = $1 and b.reference = $2",
        [tenant, r.reference],
      )
    ).rows;
    expect(row).toEqual([{ from_status: null, to_status: "requested", actor: null }]);
  });
});

describe("getBookingByToken", () => {
  it("resolves only its own booking, never with the phone", async () => {
    const a = await request("0333 7654321");
    const b = await request();
    const view = await getBookingByToken(a.token);
    expect(view).toMatchObject({
      reference: a.reference,
      status: "requested",
      eventDate: date,
      slot: "Evening",
      eventType: "Barat",
      guests: 200,
      packageName: null,
      addons: [],
      hall: null,
      quote: null,
      venueName: "Zq Hall",
    });
    expect(JSON.stringify(view)).not.toMatch(/phone|7654321/i);
    expect((await getBookingByToken(b.token))?.reference).toBe(b.reference);
  });

  it("gives null for a wrong, expired or revoked token", async () => {
    await expect(getBookingByToken("x".repeat(43))).resolves.toBeNull();
    await expect(getBookingByToken("not a token")).resolves.toBeNull();
    const expired = await request();
    const revoked = await request();
    const hash = (t: string) => one("select encode(sha256(convert_to($1, 'utf8')), 'hex')", [t]);
    await pool.query("update access_tokens set expires_at = now() - interval '1 second' where token_hash = $1", [await hash(expired.token)]);
    await pool.query("update access_tokens set revoked_at = now() where token_hash = $1", [await hash(revoked.token)]);
    await expect(getBookingByToken(expired.token)).resolves.toBeNull();
    await expect(getBookingByToken(revoked.token)).resolves.toBeNull();
  });

  it("shows expired for a past request, and no reason for a declined one", async () => {
    const past = await request();
    await pool.query("update bookings set event_date = current_date - 2 where tenant_id = $1 and reference = $2", [tenant, past.reference]);
    expect((await getBookingByToken(past.token))?.status).toBe("expired");
    const declined = await request();
    await pool.query("update bookings set status = 'declined', status_reason = 'Secret staff note' where tenant_id = $1 and reference = $2", [
      tenant,
      declined.reference,
    ]);
    const view = await getBookingByToken(declined.token);
    expect(view).toMatchObject({ status: "declined", quote: null });
    expect(JSON.stringify(view)).not.toContain("Secret staff note");
  });

  it("shows the stored totals of a confirmed booking's quote", async () => {
    const r = await request();
    const b = await one("select id from bookings where tenant_id = $1 and reference = $2", [tenant, r.reference]);
    const snapshot = { lines: [{ kind: "hall", label: "Main", amountPaisa: 100 }], subtotalPaisa: 100, taxPaisa: 0, totalPaisa: 100, advancePaisa: 50 };
    const q = await one(
      "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, $3, 90000, 45000) returning id",
      [tenant, b, snapshot],
    );
    await pool.query(
      "update bookings set status = 'confirmed', hall_id = $2, during = tstzrange(now() + interval '1 day', now() + interval '25 hours'), current_quote_id = $3 where id = $1",
      [b, hall, q],
    );
    const view = await getBookingByToken(r.token);
    expect(view).toMatchObject({ status: "confirmed", hall: "Main", quote: { lines: snapshot.lines, totalPaisa: 90000, advancePaisa: 45000 } });
  });
});
