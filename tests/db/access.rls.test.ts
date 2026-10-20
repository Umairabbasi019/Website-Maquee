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

/** Expects the statement to fail with `re`, keeping the test transaction usable. */
async function expectReject(c: Client, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_reject");
}

const OVERRIDE = "insert into membership_overrides (membership_id, permission_key, granted) values ($1, $2, $3)";

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
  const accountsA = await createTestUser(c, "accounts-a@test.local");
  const managerB = await createTestUser(c, "manager-b@test.local");
  const admin = await createTestUser(c, "admin@test.local");
  await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
  const ownerAMembership = await member(A, ownerA, "owner");
  const managerAMembership = await member(A, managerA, "manager");
  const accountsAMembership = await member(A, accountsA, "accounts");
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

  return {
    A,
    B,
    ownerA,
    managerA,
    accountsA,
    managerB,
    admin,
    ownerAMembership,
    managerAMembership,
    accountsAMembership,
    roleB,
    role,
  };
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

// Revoked from client roles outright (tests/db/tenant-secrets.test.ts), so RLS count checks do not apply.
const REVOKED_TABLES = new Set(["tenant_secrets"]);

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
      for (const t of tables.filter((t) => !REVOKED_TABLES.has(t))) {
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
      await asUser(c, s.admin, "aal2");
      expect(await hasPerm(c, s.A, "bookings.view")).toBe(true);
      expect(await count(c, "select count(*) from halls where tenant_id = $1", [s.A])).toBe(1);
    }));

  it("cannot_grant_platform_or_unheld_keys", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.ownerAMembership, "users.manage", true]);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);

      await asUser(c, s.ownerA);
      await expectReject(c, OVERRIDE, [s.managerAMembership, "platform.tenants.manage", true], /platform/);
      // ○/– cells: only a platform admin grants above role defaults, even a key the owner holds.
      await expectReject(c, OVERRIDE, [s.managerAMembership, "reports.view", true], /platform admin/);
      await expectReject(c, OVERRIDE, [s.accountsAMembership, "audit.view", true], /platform admin/);

      await asUser(c, s.admin, "aal2");
      await c.query(OVERRIDE, [s.managerAMembership, "reports.view", true]);

      await asUser(c, s.managerA);
      const roleA = await one(c, "insert into roles (tenant_id, name) values ($1, 'A custom') returning id", [s.A]);
      const rolePerm = "insert into role_permissions (role_id, permission_key) values ($1, $2)";
      await expectReject(c, rolePerm, [roleA, "audit.view"], /does not hold/);
      await expectReject(c, rolePerm, [roleA, "platform.tenants.manage"], /platform/);

      await asUser(c, s.ownerA);
      await c.query(rolePerm, [roleA, "audit.view"]); // owner holds it and it is an owner default
      // Owner holds users.manage via override, but it is not an owner default (○ cell).
      await expectReject(c, rolePerm, [roleA, "users.manage"], /owner role defaults/);
    }));

  it("cannot_assign_role_beyond_own_keys_or_from_other_tenant", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);
      const ownerRole = await s.role("owner");
      await asUser(c, s.managerA);
      await expectReject(
        c,
        "update memberships set role_id = $1 where id = $2",
        [ownerRole, s.accountsAMembership],
        /assign the owner role/, // owner rule (owner-protection.test.ts) fires before the key check
      );
      // Grant ceiling: an accounts user holding users.manage cannot hand out the manager role.
      await asSuper(c);
      const staffUser = await createTestUser(c, "staff-a@test.local");
      const staffMembership = await one(
        c,
        "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3) returning id",
        [s.A, staffUser, await s.role("staff")],
      );
      await c.query(OVERRIDE, [s.accountsAMembership, "users.manage", true]);
      await asUser(c, s.accountsA);
      await expectReject(
        c,
        "update memberships set role_id = $1 where id = $2",
        [await s.role("manager"), staffMembership],
        /does not hold/,
      );
      await asSuper(c);
      await expectReject(
        c,
        "update memberships set role_id = $1 where id = $2",
        [s.roleB, s.managerAMembership],
        /another tenant/,
      );
    }));

  it("membership_user_and_tenant_areImmutable", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);
      const secondAccount = await createTestUser(c, "manager-a-2@test.local");
      await asUser(c, s.managerA);
      await expectReject(
        c,
        "update memberships set user_id = $1 where id = $2",
        [secondAccount, s.accountsAMembership],
        /cannot be changed/,
      );
      await expectReject(
        c,
        "update memberships set tenant_id = $1 where id = $2",
        [s.B, s.accountsAMembership],
        /cannot be changed/,
      );
    }));

  it("own_membership_isOffLimits", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);
      await c.query(OVERRIDE, [s.managerAMembership, "payments.verify", false]);
      await asUser(c, s.managerA);
      await expectReject(c, OVERRIDE, [s.managerAMembership, "prices.edit", false], /own membership/);
      await expectReject(
        c,
        "delete from membership_overrides where membership_id = $1 and permission_key = 'payments.verify'",
        [s.managerAMembership],
        /own membership/,
      );
      await expectReject(
        c,
        "update memberships set role_id = $1 where id = $2",
        [await one(c, "select id from roles where tenant_id is null and name = 'staff'"), s.managerAMembership],
        /own membership/,
      );
    }));

  it("deleting_a_revoke_needs_the_key", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.ownerAMembership, "users.manage", true]);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);
      await c.query(OVERRIDE, [s.accountsAMembership, "reports.view", false]);
      const deleteRevoke = "delete from membership_overrides where membership_id = $1 and permission_key = 'reports.view'";

      await asUser(c, s.managerA); // manager lacks reports.view
      await expectReject(c, deleteRevoke, [s.accountsAMembership], /does not hold/);
      expect(
        (await c.query("update membership_overrides set permission_key = 'prices.edit' where membership_id = $1", [
          s.accountsAMembership,
        ]).then(
          (r) => r.rowCount,
          (e: Error) => e.message,
        )),
      ).toMatch(/does not hold/);
    }));

  it("deleting_a_revoke_works_for_key_holders_and_membership_delete", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query(OVERRIDE, [s.ownerAMembership, "users.manage", true]);
      await c.query(OVERRIDE, [s.accountsAMembership, "reports.view", false]);
      await asUser(c, s.ownerA); // owner holds reports.view
      const r = await c.query(
        "delete from membership_overrides where membership_id = $1 and permission_key = 'reports.view'",
        [s.accountsAMembership],
      );
      expect(r.rowCount).toBe(1);
      await asSuper(c);
      await c.query(OVERRIDE, [s.accountsAMembership, "audit.view", false]);
      await c.query(OVERRIDE, [s.managerAMembership, "users.manage", true]);
      await asUser(c, s.managerA); // lacks audit.view, but removing the whole membership is fine
      expect((await c.query("delete from memberships where id = $1", [s.accountsAMembership])).rowCount).toBe(1);
    }));

  it("audit_isAppendOnly", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.admin, "aal2");
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
      for (const t of tables.filter((t) => !REVOKED_TABLES.has(t))) {
        expect(await count(c, `select count(*) from public.${t}`), t).toBe(0);
      }
    }));
});
