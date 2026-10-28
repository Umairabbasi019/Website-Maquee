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

const COLS = "tenant_id, booking_id, kind, method, amount_paisa, status, source";
const PAYMENT = `insert into payments (${COLS}) values ($1, $2, 'payment', 'cash', 1000, 'verified', 'staff')`;

/** Two venues with one booking and one payment each, a manager per venue, plus staff and a deactivated manager in A. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const venue = async (slug: string) => {
    const tenant = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
    const customer = await one(c, "insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
    const slot = await one(c, "insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
    const booking = await one(
      c,
      `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
       values ($1, 'MM-2701-0001', $2, '2027-01-15', $3, 'Barat', 200) returning id`,
      [tenant, customer, slot],
    );
    await c.query(PAYMENT, [tenant, booking]);
    return { tenant, booking };
  };
  const A = await venue("a-venue");
  const B = await venue("b-venue");
  const member = async (tenant: string, email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenant, user, role]);
    return user;
  };
  const manager = await member(A.tenant, "mgr@test.local", "manager");
  const staff = await member(A.tenant, "staff@test.local", "staff");
  const gone = await member(A.tenant, "gone@test.local", "manager");
  await c.query("update memberships set is_active = false, deactivated_at = now() where user_id = $1", [gone]);
  const otherManager = await member(B.tenant, "other@test.local", "manager");
  return { A, B, manager, staff, gone, otherManager };
}

describe("payments RLS", () => {
  it("lets a payments.view holder read only their own venue", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      const rows = await c.query("select tenant_id from payments");
      expect(rows.rows.map((r) => r.tenant_id)).toEqual([s.A.tenant]);
    }));

  it("shows anon, staff and a deactivated user nothing, and another venue's manager only their own", () =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const user of [null, s.staff, s.gone]) {
        await asUser(c, user);
        expect(Number(await one(c, "select count(*) from payments"))).toBe(0);
        await c.query("reset role");
      }
      await asUser(c, s.otherManager);
      const rows = await c.query("select tenant_id from payments");
      expect(rows.rows.map((r) => r.tenant_id)).toEqual([s.B.tenant]);
    }));

  it("refuses insert, and update or delete reach no row", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      await expectReject(c, PAYMENT, [s.A.tenant, s.A.booking], /row-level security/);
      expect((await c.query("update payments set note = 'x'")).rowCount).toBe(0);
      expect((await c.query("delete from payments")).rowCount).toBe(0);
    }));

  it("refuses every client role on provider_events", () =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const user of [null, s.manager]) {
        await asUser(c, user);
        await expectReject(c, "select * from provider_events", [], /permission denied/);
        await c.query("reset role");
      }
    }));
});

describe("payments constraints", () => {
  it.each([
    ["a zero amount", "'payment', 'cash', 0, 'verified', 'staff'", /payments_amount_positive/],
    ["a rejected row without a reason", "'payment', 'cash', 5, 'rejected', 'staff'", /payments_reject_reason/],
    ["online without a provider", "'payment', 'online', 5, 'pending', 'provider'", /payments_provider/],
    ["a customer refund", "'refund', 'cash', 5, 'pending', 'customer_receipt'", /payments_refund_staff/],
  ])("refuses %s", (_name, values, re) =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, `insert into payments (${COLS}) values ($1, $2, ${values})`, [s.A.tenant, s.A.booking], re);
    }));

  it("refuses a reason on a verified row and a provider on a cash row", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(
        c,
        `insert into payments (${COLS}, reject_reason) values ($1, $2, 'payment', 'cash', 5, 'verified', 'staff', 'x')`,
        [s.A.tenant, s.A.booking],
        /payments_reject_reason/,
      );
      await expectReject(
        c,
        `insert into payments (${COLS}, provider) values ($1, $2, 'payment', 'cash', 5, 'pending', 'provider', 'jazzcash')`,
        [s.A.tenant, s.A.booking],
        /payments_provider/,
      );
    }));

  it("keeps provider references unique and refuses another venue's booking", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const online = `insert into payments (${COLS}, provider, provider_ref)
        values ($1, $2, 'payment', 'online', 5, 'pending', 'provider', 'jazzcash', 'ref-1')`;
      await c.query(online, [s.A.tenant, s.A.booking]);
      await expectReject(c, online, [s.A.tenant, s.A.booking], /duplicate key/);
      await expectReject(c, PAYMENT, [s.A.tenant, s.B.booking], /foreign key/);
    }));
});

describe("payment-receipts bucket", () => {
  it("is private and shows no object to anon or a signed-in user", () =>
    withDb(async (c) => {
      const s = await seed(c);
      expect(await one(c, "select public from storage.buckets where id = 'payment-receipts'")).toBe(false);
      await c.query("insert into storage.objects (bucket_id, name) values ('payment-receipts', 'probe/r.jpg')");
      for (const user of [null, s.manager]) {
        await asUser(c, user);
        expect(Number(await one(c, "select count(*) from storage.objects where bucket_id = 'payment-receipts'"))).toBe(0);
        await c.query("reset role");
      }
    }));
});
