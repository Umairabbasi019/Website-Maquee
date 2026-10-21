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

const PACKAGE =
  "insert into packages (tenant_id, event_type_id, name, price_per_guest_paisa, min_guests, items) values ($1, $2, 'Gold', $3, 100, '{a}')";

/** Two tenants, each with an event type and package, plus a reader (accounts: bookings.view) and a manager in A. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = (slug: string) =>
    one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
  const A = await tenant("a-venue");
  const B = await tenant("b-venue");
  const eventType = (t: string) =>
    one(c, "insert into event_types (tenant_id, slug, name, description, sort) values ($1, 'barat', 'Barat', 'd', 0) returning id", [t]);
  const evA = await eventType(A);
  const evB = await eventType(B);
  for (const [t, ev] of [[A, evA], [B, evB]]) {
    await c.query(PACKAGE, [t, ev, 320000]);
    await c.query("insert into offers (tenant_id, title, body, sort) values ($1, 't', 'b', 0)", [t]);
  }
  const member = async (email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [A, user, role]);
    return user;
  };
  return { A, evA, evB, reader: await member("reader@test.local", "accounts"), manager: await member("mgr@test.local", "manager") };
}

describe("catalogue RLS", () => {
  it("anon reads nothing", () =>
    withDb(async (c) => {
      await seed(c);
      await asUser(c, null);
      for (const t of ["event_types", "packages", "offers"]) {
        expect(Number(await one(c, `select count(*) from ${t}`)), t).toBe(0);
      }
    }));

  it("a reader sees own tenant rows and none of another tenant", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.reader);
      for (const t of ["event_types", "packages", "offers"]) {
        expect(Number(await one(c, `select count(*) from ${t}`)), t).toBe(1);
        expect(Number(await one(c, `select count(*) from ${t} where tenant_id <> $1`, [s.A])), t).toBe(0);
      }
    }));

  it("writes need catalogue.edit", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.reader);
      await expectReject(c, PACKAGE, [s.A, s.evA, 100], /row-level security/);
      await asUser(c, s.manager);
      await c.query(PACKAGE, [s.A, s.evA, 100]);
    }));

  it("a package cannot point at another tenant's event type", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, PACKAGE, [s.A, s.evB, 100], /foreign key/);
    }));

  it("price must be positive", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, PACKAGE, [s.A, s.evA, 0], /check constraint/);
    }));
});
