import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

const ASSET = "insert into media_assets (tenant_id, key, alt, category, sizes) values ($1, $2, 'alt', 'hero', $3)";

/** Tenants A and B with one asset each, plus a manager and a staff member in A. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = (slug: string) =>
    one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
  const A = await tenant("a-venue");
  const B = await tenant("b-venue");
  for (const t of [A, B]) await c.query(ASSET, [t, "front", "{s,m}"]);
  const member = async (email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [A, user, role]);
    return user;
  };
  return { A, manager: await member("mgr@test.local", "manager"), staff: await member("staff@test.local", "staff") };
}

describe("media_assets RLS", () => {
  it("anon reads nothing", () =>
    withDb(async (c) => {
      await seed(c);
      await asUser(c, null);
      expect(Number(await one(c, "select count(*) from media_assets"))).toBe(0);
    }));

  it("staff without media.manage reads nothing", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.staff);
      expect(Number(await one(c, "select count(*) from media_assets"))).toBe(0);
    }));

  it("a manager reads own tenant rows only", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      expect(Number(await one(c, "select count(*) from media_assets"))).toBe(1);
      expect(Number(await one(c, "select count(*) from media_assets where tenant_id <> $1", [s.A]))).toBe(0);
    }));

  it("a manager can write own tenant rows but not another tenant's", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const other = await one(c, "select id from tenants where slug = 'b-venue'");
      await asUser(c, s.manager);
      await c.query(ASSET, [s.A, "extra", "{s}"]);
      await c.query("savepoint x");
      await expect(c.query(ASSET, [other, "extra", "{s}"])).rejects.toThrow(/row-level security/);
      await c.query("rollback to savepoint x");
    }));

  it("sizes outside s, m, l, depth are rejected", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expect(c.query(ASSET, [s.A, "bad", "{xl}"])).rejects.toThrow(/check constraint/);
    }));
});
