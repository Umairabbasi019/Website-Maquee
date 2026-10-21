import { afterAll, describe, expect, it } from "vitest";
import { PERMISSIONS, buildViewer, can } from "@/modules/access";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

const ROLES = ["owner", "manager", "accounts", "staff"];

async function scalar<T>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  return Object.values((await c.query(sql, params)).rows[0])[0] as T;
}

async function tenant(c: Client, slug: string, status = "live"): Promise<string> {
  const account = await scalar<string>(c, "insert into accounts (name) values ('x') returning id");
  return scalar(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, $3) returning id", [
    account,
    slug,
    status,
  ]);
}

async function join(c: Client, tenantId: string, userId: string, role: string): Promise<string> {
  return scalar(
    c,
    `insert into memberships (tenant_id, user_id, role_id)
     values ($1, $2, (select id from roles where tenant_id is null and name = $3)) returning id`,
    [tenantId, userId, role],
  );
}

/** Builds the Viewer as `userId` the way getViewer does, from the SQL functions. */
async function viewerFor(c: Client, userId: string, aal: "aal1" | "aal2" = "aal1") {
  await asUser(c, userId, aal);
  const isAdmin = await scalar<boolean>(c, "select public.is_platform_admin()");
  const keys = (await c.query("select tenant_id, key from public.viewer_keys()")).rows;
  const roles = (await c.query("select tenant_id, role from public.viewer_roles()")).rows;
  return buildViewer({
    userId,
    isPlatformAdmin: isAdmin,
    aal,
    keys: keys.map((r) => ({ tenantId: r.tenant_id, key: r.key })),
    roles: roles.map((r) => ({ tenantId: r.tenant_id, role: r.role })),
  });
}

async function expectSameAsSql(c: Client, userId: string, tenantId: string, aal: "aal1" | "aal2" = "aal1") {
  const viewer = await viewerFor(c, userId, aal);
  for (const key of PERMISSIONS) {
    const sql = await scalar<boolean>(c, "select public.auth_has_perm($1, $2)", [tenantId, key]);
    expect(can(viewer, tenantId, key), key).toBe(sql);
  }
  return viewer;
}

describe("can() matches auth_has_perm", () => {
  it.each(ROLES)("role %s on all keys", (role) =>
    withDb(async (c) => {
      const t = await tenant(c, `t-${role}`);
      const u = await createTestUser(c, `${role}@test.local`);
      await join(c, t, u, role);
      const viewer = await expectSameAsSql(c, u, t);
      expect(viewer.memberships).toHaveLength(1);
      expect(viewer.memberships[0]).toMatchObject({ tenantId: t, role });
      expect(can(viewer, t, "platform.tenants.manage")).toBe(false);
    }),
  );

  it("owner holds audit.view, staff does not", () =>
    withDb(async (c) => {
      const t = await tenant(c, "t-pair");
      const o = await createTestUser(c, "o@test.local");
      const s = await createTestUser(c, "s@test.local");
      await join(c, t, o, "owner");
      await join(c, t, s, "staff");
      expect(can(await viewerFor(c, o), t, "audit.view")).toBe(true);
      expect(can(await viewerFor(c, s), t, "audit.view")).toBe(false);
    }),
  );

  it("revoke override removes a role key, grant override adds one", () =>
    withDb(async (c) => {
      const t = await tenant(c, "t-ovr");
      const u = await createTestUser(c, "u@test.local");
      const m = await join(c, t, u, "manager");
      await c.query(
        "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'prices.edit', false), ($1, 'reports.view', true)",
        [m],
      );
      const viewer = await expectSameAsSql(c, u, t);
      expect(can(viewer, t, "prices.edit")).toBe(false);
      expect(can(viewer, t, "reports.view")).toBe(true);
    }),
  );

  it("paused tenant and inactive membership give no keys", () =>
    withDb(async (c) => {
      const paused = await tenant(c, "t-paused", "paused");
      const live = await tenant(c, "t-inactive");
      const u = await createTestUser(c, "p@test.local");
      await join(c, paused, u, "owner");
      const m = await join(c, live, u, "owner");
      await c.query("update memberships set is_active = false where id = $1", [m]);
      const viewer = await viewerFor(c, u);
      expect(viewer.memberships).toEqual([]);
      await expectSameAsSql(c, u, paused);
      await expectSameAsSql(c, u, live);
    }),
  );

  it("non-member has no access to another tenant", () =>
    withDb(async (c) => {
      const a = await tenant(c, "t-a");
      const b = await tenant(c, "t-b");
      const u = await createTestUser(c, "m@test.local");
      await join(c, a, u, "owner");
      const viewer = await expectSameAsSql(c, u, b);
      expect(can(viewer, b, "bookings.view")).toBe(false);
    }),
  );

  it("platform admin passes every key in any tenant", () =>
    withDb(async (c) => {
      const t = await tenant(c, "t-admin");
      const u = await createTestUser(c, "adm@test.local");
      await c.query("insert into platform_admins (user_id) values ($1)", [u]);
      const viewer = await expectSameAsSql(c, u, t, "aal2");
      expect(viewer.isPlatformAdmin).toBe(true);
      expect(can(viewer, t, "platform.tenants.manage")).toBe(true);
    }),
  );

  it("platform admin at aal1 is not an admin: SQL and Viewer both say no", () =>
    withDb(async (c) => {
      const t = await tenant(c, "t-admin1");
      const u = await createTestUser(c, "adm1@test.local");
      await c.query("insert into platform_admins (user_id) values ($1)", [u]);
      const viewer = await expectSameAsSql(c, u, t, "aal1");
      expect(viewer.isPlatformAdmin).toBe(false);
      expect(can(viewer, t, "platform.tenants.manage")).toBe(false);
      expect(await scalar<boolean>(c, "select public.is_platform_admin()")).toBe(false);
    }),
  );

  it("aal1 platform admin reads no tenant rows; aal2 reads them", () =>
    withDb(async (c) => {
      await tenant(c, "t-admin-rows");
      const u = await createTestUser(c, "adm2@test.local");
      await c.query("insert into platform_admins (user_id) values ($1)", [u]);
      await asUser(c, u, "aal1");
      expect(Number(await scalar(c, "select count(*) from tenants"))).toBe(0);
      await asUser(c, u, "aal2");
      expect(Number(await scalar(c, "select count(*) from tenants"))).toBeGreaterThan(0);
    }),
  );
});
