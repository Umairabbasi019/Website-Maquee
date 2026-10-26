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

const INSERT = `insert into date_prices (tenant_id, starts_on, ends_on, event_type_id, kind, value, label)
  values ($1, $2, $3, $4, $5, $6, 'Rule') returning id`;

async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = async (slug: string) =>
    one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
  const A = await tenant("a-venue");
  const B = await tenant("b-venue");
  const barat = await one(c, "insert into event_types (tenant_id, slug, name) values ($1, 'barat', 'Barat') returning id", [A]);
  const member = async (tenantId: string, email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenantId, user, role]);
    return user;
  };
  return {
    A,
    B,
    barat,
    manager: await member(A, "mgr@test.local", "manager"),
    accounts: await member(A, "accounts@test.local", "accounts"),
    otherManager: await member(B, "other@test.local", "manager"),
  };
}

describe("date_prices", () => {
  it("refuses two overlapping all-events ranges", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await expectReject(c, INSERT, [s.A, "2026-12-10", "2026-12-15", null, "percent", 30], /date_prices_no_overlap/);
    }));

  it("lets an event-specific range overlap an all-events one", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", s.barat, "percent", 30]);
    }));

  it("refuses overlapping ranges for the same event type", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", s.barat, "percent", 20]);
      await expectReject(c, INSERT, [s.A, "2026-12-05", "2026-12-06", s.barat, "per_guest", 5000], /date_prices_no_overlap/);
    }));

  it("allows adjacent ranges and the same dates in another tenant", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await c.query(INSERT, [s.A, "2026-12-11", "2026-12-12", null, "percent", 20]);
      await c.query(INSERT, [s.B, "2026-12-01", "2026-12-10", null, "percent", 20]);
    }));

  it("checks value, kind, dates and label", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, INSERT, [s.A, "2026-12-01", "2026-12-02", null, "percent", 0], /check/);
      await expectReject(c, INSERT, [s.A, "2026-12-01", "2026-12-02", null, "percent", 301], /check/);
      await expectReject(c, INSERT, [s.A, "2026-12-01", "2026-12-02", null, "percent", -91], /check/);
      await expectReject(c, INSERT, [s.A, "2026-12-01", "2026-12-02", null, "flat", 5], /check/);
      await expectReject(c, INSERT, [s.A, "2026-12-05", "2026-12-02", null, "percent", 5], /check/);
      await expectReject(c, INSERT.replace("'Rule'", "repeat('x', 61)"), [s.A, "2026-12-01", "2026-12-02", null, "percent", 5], /check/);
    }));

  it("a manager inserts and the write is audited", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      const id = await one(c, INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await c.query("reset role");
      const audit = await c.query("select actor_user_id from audit_events where action = 'date_prices.insert' and entity_id = $1", [id]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].actor_user_id).toBe(s.manager);
    }));

  it("accounts read but cannot insert", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await asUser(c, s.accounts);
      expect(Number(await one(c, "select count(*) from date_prices"))).toBe(1);
      await expectReject(c, INSERT, [s.A, "2027-01-01", "2027-01-02", null, "percent", 5], /row-level security/);
    }));

  it("anon and another tenant read nothing and cannot write", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await asUser(c, null);
      expect(Number(await one(c, "select count(*) from date_prices"))).toBe(0);
      await expectReject(c, INSERT, [s.A, "2027-01-01", "2027-01-02", null, "percent", 5], /row-level security|permission denied/);
      await asUser(c, s.otherManager);
      expect(Number(await one(c, "select count(*) from date_prices"))).toBe(0);
      await expectReject(c, INSERT, [s.A, "2027-01-01", "2027-01-02", null, "percent", 5], /row-level security/);
      expect((await c.query("delete from date_prices")).rowCount).toBe(0);
    }));

  it("refuses an event type from another tenant", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, INSERT, [s.B, "2026-12-01", "2026-12-02", s.barat, "percent", 5], /foreign key/);
    }));

  it("deleting the event type deletes its date prices", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", s.barat, "percent", 20]);
      await c.query(INSERT, [s.A, "2026-12-01", "2026-12-10", null, "percent", 20]);
      await c.query("delete from event_types where id = $1", [s.barat]);
      expect(Number(await one(c, "select count(*) from date_prices"))).toBe(1);
    }));
});
