import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

const OWNER_ONLY = /only a platform admin can .*owner/;

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

/** Expects the statement to fail with `re`, keeping the test transaction usable. */
async function expectReject(c: Client, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_reject");
}

/** One tenant: two owners, a manager and a staff member; admin grants owner1 and manager users.manage. */
async function fixture(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = await one(
    c,
    "insert into tenants (account_id, slug, name, status) values ($1, 'own-venue', 'own-venue', 'live') returning id",
    [account],
  );
  const role = (name: string) => one(c, "select id from roles where tenant_id is null and name = $1", [name]);
  const member = async (user: string, roleName: string) =>
    one(c, "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3) returning id", [
      tenant,
      user,
      await role(roleName),
    ]);

  const owner1 = await createTestUser(c, "owner1@test.local");
  const owner2 = await createTestUser(c, "owner2@test.local");
  const manager = await createTestUser(c, "manager@test.local");
  const staff = await createTestUser(c, "staff@test.local");
  const admin = await createTestUser(c, "admin@test.local");
  await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
  const m = {
    owner1: await member(owner1, "owner"),
    owner2: await member(owner2, "owner"),
    manager: await member(manager, "manager"),
    staff: await member(staff, "staff"),
  };
  // Owner2 carries an override so override edits on an owner membership can be tested.
  await c.query("insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'reports.view', false)", [
    m.owner2,
  ]);
  for (const mid of [m.owner1, m.manager]) {
    await c.query("insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'users.manage', true)", [mid]);
  }
  return { tenant, role, owner1, manager, admin, m };
}

const OWNER_ATTACKS = (m: { owner2: string; owner1: string }) => [
  ["deactivate", "update memberships set is_active = false, deactivated_at = now() where id = $1", [m.owner2]],
  ["delete", "delete from memberships where id = $1", [m.owner2]],
  ["demote", "update memberships set role_id = (select id from roles where tenant_id is null and name = 'staff') where id = $1", [m.owner2]],
  ["insert override", "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'prices.edit', false)", [m.owner2]],
  ["update override", "update membership_overrides set granted = true where membership_id = $1", [m.owner2]],
  ["delete override", "delete from membership_overrides where membership_id = $1", [m.owner2]],
] as const;

describe("owner protection", () => {
  it("an owner with users.manage can deactivate a manager and a staff member", async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      for (const target of [f.m.manager, f.m.staff]) {
        await c.query("reset role");
        await asUser(c, f.owner1);
        const r = await c.query("update memberships set is_active = false, deactivated_at = now() where id = $1", [target]);
        expect(r.rowCount).toBe(1);
      }
    });
  });

  for (const actor of ["owner1", "manager"] as const) {
    it(`${actor} with users.manage cannot touch an owner membership`, async () => {
      await withDb(async (c) => {
        const f = await fixture(c);
        for (const [, sql, params] of OWNER_ATTACKS(f.m)) {
          await c.query("reset role");
          await asUser(c, f[actor]);
          await expectReject(c, sql, [...params], OWNER_ONLY);
        }
      });
    });
  }

  it("owner1 cannot touch their own owner membership", async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      await asUser(c, f.owner1);
      await expectReject(c, "update memberships set is_active = false where id = $1", [f.m.owner1], OWNER_ONLY);
      await expectReject(c, "delete from memberships where id = $1", [f.m.owner1], OWNER_ONLY);
    });
  });

  it("non-admins cannot assign the owner role by insert or update", async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      const ownerRole = await f.role("owner");
      const newUser = await createTestUser(c, "new@test.local");
      await asUser(c, f.owner1);
      await expectReject(c, "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [f.tenant, newUser, ownerRole], OWNER_ONLY);
      await expectReject(c, "update memberships set role_id = $2 where id = $1", [f.m.staff, ownerRole], OWNER_ONLY);
    });
  });

  it("a platform admin at aal2 can do all of it", async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      const ownerRole = await f.role("owner");
      const staffRole = await f.role("staff");
      const newUser = await createTestUser(c, "new@test.local");
      await asUser(c, f.admin, "aal2");
      const run = async (sql: string, params: unknown[]) => (await c.query(sql, params)).rowCount;
      expect(await run("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [f.tenant, newUser, ownerRole])).toBe(1);
      expect(await run("update memberships set role_id = $2 where id = $1", [f.m.staff, ownerRole])).toBe(1);
      expect(await run("insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'prices.edit', false)", [f.m.owner2])).toBe(1);
      expect(await run("update membership_overrides set granted = true where membership_id = $1", [f.m.owner2])).toBeGreaterThan(0);
      expect(await run("delete from membership_overrides where membership_id = $1", [f.m.owner2])).toBeGreaterThan(0);
      expect(await run("update memberships set is_active = false, deactivated_at = now() where id = $1", [f.m.owner2])).toBe(1);
      expect(await run("update memberships set role_id = $2 where id = $1", [f.m.owner2, staffRole])).toBe(1);
      expect(await run("delete from memberships where id = $1", [f.m.owner2])).toBe(1);
    });
  });

  it("a platform admin at aal1 is treated as a normal user", async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      await asUser(c, f.admin, "aal1");
      const r = await c.query("delete from memberships where id = $1", [f.m.owner2]);
      expect(r.rowCount).toBe(0); // RLS hides it: no membership, no users.manage
    });
  });
});
