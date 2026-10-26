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

const TABLE = { events: "event_types", packages: "packages", offers: "offers", addons: "addons", stageThemes: "stage_themes" } as const;
type CataloguePart = keyof typeof TABLE;

/** A new value for each column, valid against the seeded row. */
const NEW_VALUE: Record<string, unknown> = {
  name: "Renamed",
  title: "Renamed",
  media_key: "hall-2",
  price_per_guest_paisa: 999,
  price_paisa: 999,
  discount_kind: "fixed",
  discount_value: 20,
};

const CATALOGUE = FIELD_PERMISSIONS.filter((r): r is typeof r & { part: CataloguePart; column: string } =>
  r.part in TABLE && r.column !== undefined,
);

const PACKAGE =
  "insert into packages (tenant_id, event_type_id, name, price_per_guest_paisa, min_guests, items) values ($1, $2, 'Gold', 320000, 100, '{a}')";

/** Tenants A and B with one row in every catalogue table, and a manager of A. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = (slug: string) =>
    one(c, "insert into tenants (account_id, slug, name, status) values ($1, $2, $2, 'live') returning id", [account, slug]);
  const A = await tenant("a-venue");
  const B = await tenant("b-venue");
  const events: Record<string, string> = {};
  for (const t of [A, B]) {
    events[t] = await one(c, "insert into event_types (tenant_id, slug, name, media_key) values ($1, 'barat', 'Barat', 'hall') returning id", [t]);
    await c.query(PACKAGE, [t, events[t]]);
    await c.query("insert into offers (tenant_id, title, body, discount_kind, discount_value) values ($1, 't', 'b', 'percent', 10)", [t]);
    await c.query("insert into addons (tenant_id, name, price_paisa, basis) values ($1, 'Lights', 50000, 'flat')", [t]);
    await c.query("insert into stage_themes (tenant_id, name, price_paisa) values ($1, 'Royal', 900000)", [t]);
  }
  const manager = await createTestUser(c, "mgr@test.local");
  const role = await one(c, "select id from roles where tenant_id is null and name = 'manager'");
  const membership = await one(c, "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3) returning id", [A, manager, role]);
  return { A, B, evA: events[A], manager, membership };
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

describe("catalogue column permissions", () => {
  it.each(CATALOGUE)("$part.$field needs $key", (row) =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      const update = `update ${TABLE[row.part]} set ${row.column} = $1 where tenant_id = $2`;
      await override(c, s.membership, row.key, false);
      await asUser(c, s.manager);
      await expectReject(c, update, [NEW_VALUE[row.column], s.A], needs(row.key));
      await override(c, s.membership, row.key, true);
      await asUser(c, s.manager);
      expect((await c.query(update, [NEW_VALUE[row.column], s.A])).rowCount).toBe(1);
    }));

  it("refuses writes outside the site editor", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await asUser(c, s.manager);
      await expectReject(c, PACKAGE, [s.A, s.evA], /edit through the site editor/);
    }));

  it("a manager without prices.edit renames a package but cannot insert one", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      await override(c, s.membership, "prices.edit", false);
      await asUser(c, s.manager);
      expect((await c.query("update packages set name = 'Platinum' where tenant_id = $1", [s.A])).rowCount).toBe(1);
      await expectReject(c, PACKAGE, [s.A, s.evA], needs("prices.edit"));
    }));

  it("a manager with only prices.edit changes a price but not the name", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      await override(c, s.membership, "catalogue.edit", false);
      await asUser(c, s.manager);
      expect((await c.query("update packages set price_per_guest_paisa = 330000 where tenant_id = $1", [s.A])).rowCount).toBe(1);
      await expectReject(c, "update packages set name = 'Platinum' where tenant_id = $1", [s.A], needs("catalogue.edit"));
    }));

  it("a manager cannot update another tenant's add-on", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await publishing(c);
      await asUser(c, s.manager);
      expect((await c.query("update addons set price_paisa = 1 where tenant_id = $1", [s.B])).rowCount).toBe(0);
    }));
});
