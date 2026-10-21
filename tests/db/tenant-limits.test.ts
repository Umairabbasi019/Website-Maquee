import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

/** Tenant with `managers` active managers and `staff` active staff, plus a platform admin user. */
async function setup(c: Client, managers: number, staff: number) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = await one(
    c,
    "insert into tenants (account_id, slug, name, login_limit, manager_limit) values ($1, $2, $2, 10, 5) returning id",
    [account, `t-${randomUUID()}`],
  );
  for (const [role, n] of [["manager", managers], ["staff", staff]] as const) {
    const roleId = await one(c, "select id from roles where tenant_id is null and name = $1", [role]);
    for (let i = 0; i < n; i++) {
      const user = await createTestUser(c, `${randomUUID()}@test.local`);
      await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenant, user, roleId]);
    }
  }
  const admin = await createTestUser(c, `${randomUUID()}@test.local`);
  await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
  return { tenant, admin };
}

const SET = "select public.set_tenant_limits($1, $2, $3)";
const limits = (c: Client, tenant: string) =>
  c.query("select login_limit, manager_limit from tenants where id = $1", [tenant]).then((r) => r.rows[0]);

async function expectReject(c: Client, params: unknown[], message: string) {
  await c.query("savepoint expect_reject");
  await expect(c.query(SET, params)).rejects.toThrow(message);
  await c.query("rollback to savepoint expect_reject");
}

describe("set_tenant_limits", () => {
  it("lets a platform admin at aal2 set limits at or above the active counts", () =>
    withDb(async (c) => {
      const { tenant, admin } = await setup(c, 2, 1);
      await asUser(c, admin, "aal2");
      await c.query(SET, [tenant, 3, 2]);
      expect(await limits(c, tenant)).toEqual({ login_limit: 3, manager_limit: 2 });
    }));

  it("rejects a manager limit below the active managers and changes nothing", () =>
    withDb(async (c) => {
      const { tenant, admin } = await setup(c, 2, 1);
      await asUser(c, admin, "aal2");
      await expectReject(c, [tenant, 10, 1], "manager_limit_below_active");
      expect(await limits(c, tenant)).toEqual({ login_limit: 10, manager_limit: 5 });
    }));

  it("rejects a login limit below the active members", () =>
    withDb(async (c) => {
      const { tenant, admin } = await setup(c, 2, 1);
      await asUser(c, admin, "aal2");
      await expectReject(c, [tenant, 2, 2], "login_limit_below_active");
    }));

  it("rejects values outside 1 to 50", () =>
    withDb(async (c) => {
      const { tenant, admin } = await setup(c, 0, 0);
      await asUser(c, admin, "aal2");
      await expectReject(c, [tenant, 0, 1], "limits must be 1 to 50");
      await expectReject(c, [tenant, 51, 1], "limits must be 1 to 50");
    }));

  it("refuses an admin at aal1 and a tenant member", () =>
    withDb(async (c) => {
      const { tenant, admin } = await setup(c, 1, 0);
      const owner = await createTestUser(c, `${randomUUID()}@test.local`);
      const ownerRole = await one(c, "select id from roles where tenant_id is null and name = 'owner'");
      await c.query("insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenant, owner, ownerRole]);
      await asUser(c, admin, "aal1");
      await expectReject(c, [tenant, 5, 2], "platform admin only");
      await asUser(c, owner, "aal2");
      await expectReject(c, [tenant, 5, 2], "platform admin only");
    }));
});
