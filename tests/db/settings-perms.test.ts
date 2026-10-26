import { afterAll, describe, expect, it } from "vitest";
import { FIELD_PERMISSIONS } from "../fixtures/field-permissions";
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

const needs = (key: string) => new RegExp(`needs ${key.replace(/\./g, "\\.")}`);

const SETTINGS_PARTS = ["identity", "content", "theme", "sections", "messaging"];
const SETTINGS = FIELD_PERMISSIONS.filter((r) => SETTINGS_PARTS.includes(r.part));

/** Changes one field (draft path) of one settings column. */
const SET_FIELD = (part: string) =>
  `update tenant_settings set ${part} = jsonb_set(${part}, $1::text[], '"changed"') where tenant_id = $2`;

/** Tenant A with every settings path the field table names, its hall, and a manager, staff and accounts member. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const A = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, 'a-venue', 'A', 'live') returning id", [account]);
  await c.query(
    `update tenant_settings set
       identity = '{"name": "A", "phones": ["+923000000000"], "address": "x", "openingHours": [], "social": {}}',
       theme = '{"colors": {"primary": "#000000"}}',
       sections = '[{"key": "hero", "visible": true}]',
       messaging = '{"whatsappNumber": "923000000000"}',
       money_rules = '{"taxPercent": 0}',
       content = '{"sample": true, "hero": {}, "contact": {"manager": {"name": "A"}}, "gallery": {"tiles": []}, "packages": {"defaultEvent": "barat"}}'
     where tenant_id = $1`,
    [A],
  );
  const hall = await one(c, "insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 100) returning id", [A]);
  const member = async (email: string, roleName: string) => {
    const user = await createTestUser(c, email);
    const role = await one(c, "select id from roles where tenant_id is null and name = $1", [roleName]);
    const membership = await one(c, "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3) returning id", [A, user, role]);
    return { user, membership };
  };
  return {
    A,
    hall,
    manager: await member("mgr@test.local", "manager"),
    staff: await member("staff@test.local", "staff"),
    accounts: await member("accounts@test.local", "accounts"),
  };
}

const publishing = (c: Client) => c.query("select set_config('app.publishing', 'on', true)");

async function override(c: Client, membership: string, key: string, granted: boolean) {
  await c.query("reset role");
  await c.query(
    `insert into membership_overrides (membership_id, permission_key, granted) values ($1, $2, $3)
     on conflict (membership_id, permission_key) do update set granted = excluded.granted`,
    [membership, key, granted],
  );
}

describe("tenant_settings field permissions", () => {
  it.each(SETTINGS)("$part $field needs $key", (row) =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      const path = row.field.split(".");
      await override(c, s.manager.membership, row.key, false);
      await asUser(c, s.manager.user);
      await expectReject(c, SET_FIELD(row.part), [path, s.A], needs(row.key));
      await override(c, s.manager.membership, row.key, true);
      await asUser(c, s.manager.user);
      expect((await c.query(SET_FIELD(row.part), [path, s.A])).rowCount).toBe(1);
    }));

  it("refuses phones and theme changed together without tenant.settings.edit", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      await asUser(c, s.manager.user);
      await expectReject(
        c,
        `update tenant_settings set identity = jsonb_set(identity, '{phones}', '["+923111111111"]'),
           theme = jsonb_set(theme, '{colors,primary}', '"#ffffff"') where tenant_id = $1`,
        [s.A],
        needs("tenant.settings.edit"),
      );
    }));

  it("refuses money_rules without tenant.settings.edit", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      await asUser(c, s.manager.user);
      await expectReject(c, `update tenant_settings set money_rules = '{"taxPercent": 99}' where tenant_id = $1`, [s.A], needs("tenant.settings.edit"));
    }));

  it("refuses writes outside the site editor", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager.user);
      await expectReject(c, "update tenant_settings set identity = identity where tenant_id = $1", [s.A], /edit through the site editor/);
    }));

  it("accounts and staff read no settings", () =>
    withDb(async (c) => {
      const s = await seed(c);
      for (const who of [s.accounts, s.staff]) {
        await asUser(c, who.user);
        expect(Number(await one(c, "select count(*) from tenant_settings"))).toBe(0);
      }
    }));
});

describe("halls hire price", () => {
  it("a manager sets the hire price but not the capacity, and the change is audited", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager.user);
      expect((await c.query("update halls set hire_price_paisa = 5000000 where id = $1", [s.hall])).rowCount).toBe(1);
      await expectReject(c, "update halls set capacity_max = 200 where id = $1", [s.hall], needs("tenant.settings.edit"));
      await c.query("reset role");
      const audit = await c.query("select before, after, actor_user_id from audit_events where action = 'halls.update' and entity_id = $1", [s.hall]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].before.hire_price_paisa).toBeNull();
      expect(audit.rows[0].after.hire_price_paisa).toBe(5000000);
      expect(audit.rows[0].actor_user_id).toBe(s.manager.user);
    }));

  it("hire price must be positive", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(c, "update halls set hire_price_paisa = 0 where id = $1", [s.hall], /check constraint/);
    }));
});
