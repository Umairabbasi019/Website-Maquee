import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

const ALL_KEYS = [
  "platform.tenants.manage",
  "tenant.settings.edit",
  "users.manage",
  "bookings.view",
  "bookings.edit",
  "quotes.override",
  "calendar.manage",
  "catalogue.edit",
  "prices.edit",
  "media.manage",
  "payments.view",
  "payments.verify",
  "enquiries.handle",
  "marketing.send",
  "reports.view",
  "schedule.manage",
  "schedule.view_own",
  "audit.view",
];

/** Back to the test superuser (bypasses RLS) for setup. */
async function asSuper(c: Client) {
  await c.query("reset role");
}

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

async function count(c: Client, sql: string, params: unknown[] = []): Promise<number> {
  return Number(await one(c, sql, params));
}

async function hasPerm(c: Client, tenant: string, key: string): Promise<boolean> {
  return one<boolean>(c, "select public.auth_has_perm($1, $2)", [tenant, key]);
}

/** Two live tenants with members, and a row of tenant B in every tenant-scoped table. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const newTenant = (slug: string) =>
    one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [
      account,
      slug,
    ]);
  const A = await newTenant("a-venue");
  const B = await newTenant("b-venue");
  const role = (name: string) => one(c, "select id from roles where tenant_id is null and name = $1", [name]);
  const member = async (tenant: string, user: string, roleName: string) =>
    one(c, "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3) returning id", [
      tenant,
      user,
      await role(roleName),
    ]);

  const ownerA = await createTestUser(c, "owner-a@test.local");
  const managerA = await createTestUser(c, "manager-a@test.local");
  const managerB = await createTestUser(c, "manager-b@test.local");
  const admin = await createTestUser(c, "admin@test.local");
  await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
  const ownerAMembership = await member(A, ownerA, "owner");
  const managerAMembership = await member(A, managerA, "manager");
  const managerBMembership = await member(B, managerB, "manager");

  await c.query(
    "insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Hall A', 0, 100), ($2, 'Hall B', 0, 100)",
    [A, B],
  );
  await c.query("insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Night', '19:00', '23:00')", [B]);
  await c.query("insert into tenant_domains (tenant_id, host) values ($1, 'b.test')", [B]);
  await c.query("insert into tenant_features (tenant_id, feature_key, enabled) values ($1, 'invites', true)", [B]);
  await c.query("insert into tenant_secrets (tenant_id, kind, ciphertext) values ($1, 'whatsapp', 'x')", [B]);
  const roleB = await one(c, "insert into roles (tenant_id, name) values ($1, 'B custom') returning id", [B]);
  await c.query("insert into role_permissions (role_id, permission_key) values ($1, 'bookings.view')", [roleB]);
  await c.query(
    "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'reports.view', true)",
    [managerBMembership],
  );
  await c.query("insert into audit_events (tenant_id, actor_kind, action, entity) values ($1, 'system', 'seed', 'tenant')", [
    B,
  ]);

  return { A, B, ownerA, managerA, managerB, admin, ownerAMembership, managerAMembership, roleB, role };
}

/** Every public table with a tenant_id column, so new tables are covered automatically. */
async function tenantTables(c: Client): Promise<string[]> {
  const r = await c.query(
    `select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'tenant_id'
       and table_name in (select table_name from information_schema.tables
                          where table_schema = 'public' and table_type = 'BASE TABLE')
     order by table_name`,
  );
  return r.rows.map((row) => row.table_name as string);
}

async function allTables(c: Client): Promise<string[]> {
  const r = await c.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  return r.rows.map((row) => row.table_name as string);
}

describe("access RLS", () => {
  it("managerOfA_cannotReadTenantB", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const tables = await tenantTables(c);
      expect(tables.length).toBeGreaterThanOrEqual(8);
      // Fixture must hold a tenant B row in every table, or a 0 count proves nothing.
      for (const t of tables) {
        expect(await count(c, `select count(*) from public.${t} where tenant_id = $1`, [s.B]), t).toBeGreaterThan(0);
      }
      const joined = {
        tenants: "id = $1",
        role_permissions: "role_id in (select id from public.roles where tenant_id = $1)",
        membership_overrides: "membership_id in (select id from public.memberships where tenant_id = $1)",
      };

      await asUser(c, s.managerA);
      expect(await count(c, "select count(*) from halls where tenant_id = $1", [s.A])).toBe(1);
      for (const t of tables) {
        expect(await count(c, `select count(*) from public.${t} where tenant_id = $1`, [s.B]), t).toBe(0);
        expect((await c.query(`update public.${t} set tenant_id = tenant_id where tenant_id = $1`, [s.B])).rowCount, t).toBe(0);
        expect((await c.query(`delete from public.${t} where tenant_id = $1`, [s.B])).rowCount, t).toBe(0);
      }
      for (const [t, where] of Object.entries(joined)) {
        expect(await count(c, `select count(*) from public.${t} where ${where}`, [s.B]), t).toBe(0);
        expect((await c.query(`delete from public.${t} where ${where}`, [s.B])).rowCount, t).toBe(0);
      }
      expect((await c.query("update tenants set name = 'x' where id = $1", [s.B])).rowCount).toBe(0);
    }));

  it("manager_hasDefaultKeys", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.managerA);
      expect(await hasPerm(c, s.A, "prices.edit")).toBe(true);
      expect(await hasPerm(c, s.A, "users.manage")).toBe(false);
      expect(await hasPerm(c, s.B, "prices.edit")).toBe(false);
    }));

  it("override_removesKey", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(
        "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'prices.edit', false)",
        [s.managerAMembership],
      );
      await asUser(c, s.managerA);
      expect(await hasPerm(c, s.A, "prices.edit")).toBe(false);
      expect(await hasPerm(c, s.A, "bookings.view")).toBe(true);
    }));

  it("deactivated_getsNothing", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query("update memberships set is_active = false, deactivated_at = now() where id = $1", [
        s.managerAMembership,
      ]);
      await c.query(
        "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'users.manage', true)",
        [s.managerAMembership],
      );
      await asUser(c, s.managerA);
      for (const key of ALL_KEYS) expect(await hasPerm(c, s.A, key), key).toBe(false);
      expect(await count(c, "select count(*) from halls")).toBe(0);
      expect(await count(c, "select count(*) from tenants")).toBe(0);
      expect(await count(c, "select count(*) from memberships")).toBe(0);
    }));

  it("paused_tenant_blocksMembers_notSuperAdmin", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query("update tenants set status = 'paused' where id = $1", [s.A]);
      await asUser(c, s.managerA);
      expect(await hasPerm(c, s.A, "bookings.view")).toBe(false);
      expect(await count(c, "select count(*) from halls")).toBe(0);
      expect(await count(c, "select count(*) from tenants")).toBe(0);
      await asUser(c, s.admin);
      expect(await hasPerm(c, s.A, "bookings.view")).toBe(true);
      expect(await count(c, "select count(*) from halls where tenant_id = $1", [s.A])).toBe(1);
    }));

  it("cannot_grant_platform_or_unheld_keys", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const grant = (membership: string, key: string) =>
        c.query("insert into membership_overrides (membership_id, permission_key, granted) values ($1, $2, true)", [
          membership,
          key,
        ]);
      await grant(s.ownerAMembership, "users.manage");
      await grant(s.managerAMembership, "users.manage");

      await asUser(c, s.ownerA);
      await c.query("savepoint s1");
      await expect(grant(s.managerAMembership, "platform.tenants.manage")).rejects.toThrow(/platform/);
      await c.query("rollback to savepoint s1");
      await grant(s.managerAMembership, "reports.view"); // owner holds it, so this is allowed

      await asUser(c, s.managerA);
      await c.query("savepoint s2");
      await expect(grant(s.managerAMembership, "audit.view")).rejects.toThrow(/does not hold/);
      await c.query("rollback to savepoint s2");

      const roleA = await one(c, "insert into roles (tenant_id, name) values ($1, 'A custom') returning id", [s.A]);
      await c.query("savepoint s3");
      await expect(
        c.query("insert into role_permissions (role_id, permission_key) values ($1, 'audit.view')", [roleA]),
      ).rejects.toThrow(/does not hold/);
      await c.query("rollback to savepoint s3");
      await expect(
        c.query("insert into role_permissions (role_id, permission_key) values ($1, 'platform.tenants.manage')", [roleA]),
      ).rejects.toThrow(/platform/);
    }));

  it("cannot_assign_role_beyond_own_keys_or_from_other_tenant", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(
        "insert into membership_overrides (membership_id, permission_key, granted) values ($1, 'users.manage', true)",
        [s.managerAMembership],
      );
      const ownerRole = await s.role("owner");
      await asUser(c, s.managerA);
      await c.query("savepoint s1");
      await expect(
        c.query("update memberships set role_id = $1 where id = $2", [ownerRole, s.managerAMembership]),
      ).rejects.toThrow(/does not hold/);
      await c.query("rollback to savepoint s1");
      await asSuper(c);
      await expect(
        c.query("update memberships set role_id = $1 where id = $2", [s.roleB, s.managerAMembership]),
      ).rejects.toThrow(/another tenant/);
    }));

  it("audit_isAppendOnly", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.admin);
      await c.query("select public.record_audit($1, 'test', 'tenant', $1, null, '{}'::jsonb, 'why')", [s.A]);
      const actor = await one(c, "select actor_user_id from audit_events where action = 'test'");
      expect(actor).toBe(s.admin);

      for (const sql of ["update audit_events set reason = 'x'", "delete from audit_events"]) {
        await c.query("savepoint s");
        const affected = await c.query(sql).then(
          (r) => r.rowCount,
          () => 0,
        );
        await c.query("rollback to savepoint s");
        expect(affected, sql).toBe(0);
      }
      await asSuper(c);
      await c.query("savepoint s");
      await expect(c.query("delete from audit_events")).rejects.toThrow(/append-only/);
      await c.query("rollback to savepoint s");

      await asUser(c, s.managerB);
      await expect(
        c.query("select public.record_audit($1, 'forged', 'tenant', null, null, null, null)", [s.A]),
      ).rejects.toThrow(/not allowed/);
    }));

  it("anon_readsNothing", () =>
    withDb(async (c) => {
      await seed(c);
      const tables = await allTables(c);
      await asUser(c, null);
      for (const t of tables) {
        expect(await count(c, `select count(*) from public.${t}`), t).toBe(0);
      }
    }));
});
