import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The race needs two sessions that commit, so this file commits a throwaway venue and deletes it afterwards.
const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const pool = new pg.Pool({ connectionString: URL });
const one = async <T = string>(sql: string, params: unknown[] = [], db: pg.Pool | pg.Client = pool): Promise<T> =>
  Object.values((await db.query(sql, params)).rows[0])[0] as T;

const PROVIDER = `test-${randomUUID()}`;
const ADVANCE = 50_000;
let tenant = "";
let hall = "";
let slot = "";
let customer = "";
let n = 0;

/** A held booking on its own day, with a pending online payment of the advance. */
async function heldWithOnlinePayment() {
  const day = String(++n).padStart(2, "0");
  const b = await one(
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
     values ($1, $2, $3, $4, $5, 'Barat', 200) returning id`,
    [tenant, `ZP-2702-${day}`, customer, `2027-02-${day}`, slot],
  );
  const q = await one(
    "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 100000, $3) returning id",
    [tenant, b, ADVANCE],
  );
  await pool.query(
    `update bookings set status = 'awaiting_advance', hall_id = $2, during = tstzrange($3::date + time '13:00', $3::date + time '18:00'),
       current_quote_id = $4, hold_expires_at = now() + interval '1 day' where id = $1`,
    [b, hall, `2027-02-${day}`, q],
  );
  const ref = randomUUID();
  const payment = await one("select public.record_payment($1, 'payment', 'online', $2, 'provider', null, null, $3, $4, null)", [
    b,
    ADVANCE,
    PROVIDER,
    ref,
  ]);
  return { b, ref, payment };
}

const apply = (ref: string, opts: { event?: string; status?: string; amount?: number; currency?: string } = {}, db: pg.Pool | pg.Client = pool) =>
  one(
    "select public.apply_provider_event($1, $2, $3, $4, $5, $6, $7)",
    [PROVIDER, opts.event ?? randomUUID(), ref, opts.status ?? "paid", opts.amount ?? ADVANCE, opts.currency ?? "PKR", { ref }],
    db,
  );

const state = async (b: string, payment: string) =>
  (
    await pool.query(
      "select b.status as booking, p.status as payment, p.verified_by, p.reject_reason from bookings b join payments p on p.booking_id = b.id where p.id = $1 and b.id = $2",
      [payment, b],
    )
  ).rows[0];

beforeAll(async () => {
  const account = await one("insert into accounts (name) values ('Provider test') returning id");
  tenant = await one("insert into tenants (account_id, slug, name, status) values ($1, $2, 'Zp Hall', 'live') returning id", [
    account,
    `zp-${randomUUID()}`,
  ]);
  hall = await one("insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  slot = await one("insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  customer = await one("insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
});

afterAll(async () => {
  await pool.query("delete from provider_events where provider = $1", [PROVIDER]);
  // Bookings first: their slot key is on delete restrict.
  await pool.query("delete from bookings where tenant_id = $1", [tenant]);
  await pool.query("delete from tenants where id = $1", [tenant]);
  await pool.end();
});

describe("apply_provider_event", () => {
  it("applies the same event delivered twice at once exactly once", async () => {
    const { b, ref, payment } = await heldWithOnlinePayment();
    const event = randomUUID();
    const clients = [new pg.Client({ connectionString: URL }), new pg.Client({ connectionString: URL })];
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.all(clients.map((c) => apply(ref, { event }, c)));
      expect(results.sort()).toEqual(["applied", "duplicate"]);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    expect(await one<number>("select count(*)::int from payments where booking_id = $1 and status = 'verified'", [b])).toBe(1);
    expect(await state(b, payment)).toEqual({ booking: "confirmed", payment: "verified", verified_by: null, reject_reason: null });
    expect(await one("select actor from booking_status_history where booking_id = $1 and to_status = 'confirmed'", [b])).toBeNull();
    expect(await one("select result from provider_events where provider = $1 and event_id = $2", [PROVIDER, event])).toBe("applied");
  });

  it.each([
    ["an amount 1 paisa short", { amount: ADVANCE - 1 }],
    ["an amount 1 paisa over", { amount: ADVANCE + 1 }],
    ["USD", { currency: "USD" }],
  ])("refuses %s as a mismatch, stores the event, and treats a replay as a duplicate", async (_, wrong) => {
    const { b, ref, payment } = await heldWithOnlinePayment();
    const event = randomUUID();
    expect(await apply(ref, { event, ...wrong })).toBe("mismatch");
    expect(await state(b, payment)).toEqual({ booking: "awaiting_advance", payment: "pending", verified_by: null, reject_reason: null });
    const stored = (await pool.query("select result, payment_id from provider_events where provider = $1 and event_id = $2", [PROVIDER, event])).rows[0];
    expect(stored).toEqual({ result: "mismatch", payment_id: payment });
    expect(await apply(ref, { event })).toBe("duplicate");
    expect((await state(b, payment)).payment).toBe("pending");
  });

  it("stores an event for an unknown ref as unknown", async () => {
    const event = randomUUID();
    expect(await apply(randomUUID(), { event })).toBe("unknown");
    const stored = (await pool.query("select result, payment_id from provider_events where provider = $1 and event_id = $2", [PROVIDER, event])).rows[0];
    expect(stored).toEqual({ result: "unknown", payment_id: null });
  });

  it("rejects the payment on a failed event and leaves the hold", async () => {
    const { b, ref, payment } = await heldWithOnlinePayment();
    expect(await apply(ref, { status: "failed" })).toBe("applied");
    expect(await state(b, payment)).toEqual({ booking: "awaiting_advance", payment: "rejected", verified_by: null, reject_reason: "Payment failed" });
  });

  it("changes nothing for a second event on a payment that is no longer pending", async () => {
    const { b, ref, payment } = await heldWithOnlinePayment();
    expect(await apply(ref)).toBe("applied");
    expect(await apply(ref, { status: "failed" })).toBe("duplicate");
    expect(await state(b, payment)).toMatchObject({ booking: "confirmed", payment: "verified" });
  });
});
