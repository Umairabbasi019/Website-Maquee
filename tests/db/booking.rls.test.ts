import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

async function expectReject(c: Client, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_reject");
}

type Venue = { tenant: string; customer: string; slot: string; eventType: string; booking: string };

/** One row in every booking table for a venue, written as the server (postgres). */
async function venue(c: Client, account: string, slug: string): Promise<Venue> {
  const tenant = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
  const customer = await one(c, "insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
  const slot = await one(c, "insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  const eventType = await one(c, "insert into event_types (tenant_id, slug, name) values ($1, 'barat', 'Barat') returning id", [tenant]);
  const booking = await one(
    c,
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, event_type_name, guests)
     values ($1, 'MM-2701-0001', $2, '2027-01-15', $3, $4, 'Barat', 200) returning id`,
    [tenant, customer, slot, eventType],
  );
  await c.query(
    "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 100000, 50000)",
    [tenant, booking],
  );
  await c.query(
    "insert into access_tokens (tenant_id, kind, target_id, token_hash, expires_at) values ($1, 'booking', $2, $3, now() + interval '60 days')",
    [tenant, booking, `hash-${slug}`],
  );
  await c.query("insert into booking_ref_counters (tenant_id, yymm, n) values ($1, '2701', 1)", [tenant]);
  await c.query("insert into booking_request_hits (tenant_id, key_hash) values ($1, 'k')", [tenant]);
  return { tenant, customer, slot, eventType, booking };
}

async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const A = await venue(c, account, "a-venue");
  const B = await venue(c, account, "b-venue");
  const member = async (tenant: string, email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenant, user, role]);
    return user;
  };
  const manager = await member(A.tenant, "mgr@test.local", "manager");
  const accounts = await member(A.tenant, "accounts@test.local", "accounts");
  const staff = await member(A.tenant, "staff@test.local", "staff");
  const gone = await member(A.tenant, "gone@test.local", "manager");
  await c.query("update memberships set is_active = false, deactivated_at = now() where user_id = $1", [gone]);
  const otherManager = await member(B.tenant, "other@test.local", "manager");
  return { A, B, manager, accounts, staff, gone, otherManager };
}

const READABLE = ["customers", "bookings", "booking_status_history", "quotes"] as const;
const SERVER_ONLY = ["access_tokens", "booking_ref_counters", "booking_request_hits"] as const;

const INSERTS: Record<(typeof READABLE)[number] | (typeof SERVER_ONLY)[number], (v: Venue) => [string, unknown[]]> = {
  customers: (v) => ["insert into customers (tenant_id, name, phone_e164) values ($1, 'X', '+923009999999')", [v.tenant]],
  bookings: (v) => [
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, event_type_name, guests)
     values ($1, 'X-1', $2, '2027-02-01', $3, $4, 'Barat', 50)`,
    [v.tenant, v.customer, v.slot, v.eventType],
  ],
  booking_status_history: (v) => [
    "insert into booking_status_history (tenant_id, booking_id, to_status) values ($1, $2, 'confirmed')",
    [v.tenant, v.booking],
  ],
  quotes: (v) => [
    "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 2, '{}', 1, 1)",
    [v.tenant, v.booking],
  ],
  access_tokens: (v) => [
    "insert into access_tokens (tenant_id, kind, target_id, token_hash, expires_at) values ($1, 'booking', $2, 'h2', now())",
    [v.tenant, v.booking],
  ],
  booking_ref_counters: (v) => ["insert into booking_ref_counters (tenant_id, yymm, n) values ($1, '2702', 1)", [v.tenant]],
  booking_request_hits: (v) => ["insert into booking_request_hits (tenant_id, key_hash) values ($1, 'k2')", [v.tenant]],
};

describe("booking tables RLS", () => {
  it.each(READABLE)("%s: a bookings.view holder reads only their own venue", (table) =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const user of [s.manager, s.accounts]) {
        await asUser(c, user);
        const rows = await c.query(`select tenant_id from ${table}`);
        expect(rows.rows.map((r) => r.tenant_id)).toEqual([s.A.tenant]);
        await c.query("reset role");
      }
    }));

  it.each(READABLE)("%s: anon, another venue, staff without bookings.view and a deactivated user read nothing", (table) =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const user of [null, s.staff, s.gone]) {
        await asUser(c, user);
        expect(Number(await one(c, `select count(*) from ${table}`))).toBe(0);
        await c.query("reset role");
      }
      await asUser(c, s.otherManager);
      const rows = await c.query(`select tenant_id from ${table}`);
      expect(rows.rows.map((r) => r.tenant_id)).toEqual([s.B.tenant]);
    }));

  it.each(READABLE)("%s: a manager cannot insert, and update or delete reaches no row", (table) =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      const [sql, params] = INSERTS[table](s.A);
      await expectReject(c, sql, params, /row-level security/);
      expect((await c.query(`update ${table} set tenant_id = tenant_id`)).rowCount).toBe(0);
      expect((await c.query(`delete from ${table}`)).rowCount).toBe(0);
      await c.query("reset role");
      expect(Number(await one(c, `select count(*) from ${table} where tenant_id = $1`, [s.A.tenant]))).toBe(1);
    }));

  it.each(SERVER_ONLY)("%s: a manager cannot insert, update or delete", (table) =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      const [sql, params] = INSERTS[table](s.A);
      await expectReject(c, sql, params, /permission denied/);
      await expectReject(c, `update ${table} set tenant_id = tenant_id`, [], /permission denied/);
      await expectReject(c, `delete from ${table}`, [], /permission denied/);
    }));

  it.each(SERVER_ONLY)("%s: no client role can read it", (table) =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const user of [null, s.manager]) {
        await asUser(c, user);
        await expectReject(c, `select * from ${table}`, [], /permission denied/);
        await c.query("reset role");
      }
    }));
});
