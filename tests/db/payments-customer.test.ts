import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// getCustomerPayments uses the service client on its own connection, so this file commits a throwaway venue and deletes it afterwards.
const { getCustomerPayments } = await import("@/modules/payments");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const one = async <T = string>(sql: string, params: unknown[] = []): Promise<T> => Object.values((await pool.query(sql, params)).rows[0])[0] as T;

let tenant = "";
let hall = "";
let slot = "";
let customer = "";
let n = 0;

/** A booking with a quote in the hall on 2027-03-10, 13:00 to 18:00 UTC, set to `status` by legal moves. */
async function booking(status: "hold_expired" | "confirmed") {
  const b = await one(
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
     values ($1, $2, $3, '2027-03-10', $4, 'Barat', 200) returning id`,
    [tenant, `MM-2703-${String(++n).padStart(4, "0")}`, customer, slot],
  );
  const q = await one("insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 100000, 50000) returning id", [
    tenant,
    b,
  ]);
  await pool.query(
    `update bookings set status = $4, hall_id = $2, current_quote_id = $3, during = tstzrange('2027-03-10 13:00+00', '2027-03-10 18:00+00'),
       hold_expires_at = case when $4 = 'awaiting_advance' then now() + interval '1 day' end
     where id = $1`,
    [b, hall, q, status === "confirmed" ? "confirmed" : "awaiting_advance"],
  );
  if (status === "hold_expired") await pool.query("update bookings set status = 'hold_expired' where id = $1", [b]);
  return b;
}

beforeAll(async () => {
  const account = await one("insert into accounts (name) values ('Customer pay test') returning id");
  tenant = await one("insert into tenants (account_id, slug, name, status) values ($1, $2, 'Pay Hall', 'live') returning id", [account, `cp-${randomUUID()}`]);
  const rules = { paymentMethods: ["bank"], paymentAccounts: { bank: { bankName: "Bank", accountTitle: "Pay Hall", accountNumber: "PK00" } } };
  await pool.query("insert into tenant_settings (tenant_id, money_rules) values ($1, $2) on conflict (tenant_id) do update set money_rules = $2", [tenant, rules]);
  hall = await one("insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  slot = await one("insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  customer = await one("insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
});

afterAll(async () => {
  await pool.query("delete from bookings where tenant_id = $1", [tenant]);
  await pool.query("delete from tenants where id = $1", [tenant]);
  await pool.end();
});

describe("getCustomerPayments on an expired hold", () => {
  it("offers the receipt form while the slot is free, and nothing once another booking holds it", async () => {
    const expired = await booking("hold_expired");
    expect(await getCustomerPayments(tenant, expired)).toMatchObject({ canUpload: true });
    await booking("confirmed");
    expect(await getCustomerPayments(tenant, expired)).toMatchObject({ canUpload: false, online: false });
  });
});
