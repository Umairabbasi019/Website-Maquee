import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { getPublicCatalogue } from "@/modules/catalogue";
import { SiteDraftSchema } from "@/modules/editor";
import { asUser, closeDb, withDb } from "./helpers";

// Reads the seeded Manor venue and users, so run `npm run db:seed` first.
afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function one<T = string>(c: Client | pg.Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

async function expectReject(c: Client, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_reject");
}

const PUBLISH = "select public.publish_site($1, $2) as diff";

const ids = { manor: "", manager: "", accounts: "", admin: "", membership: "", gold: "", barat: "" };

beforeAll(async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    ids.manor = await one(c, "select id from tenants where slug = 'manor'");
    const user = (email: string) => one(c, "select id from auth.users where email = $1", [email]);
    ids.manager = await user("manager1@manor.test");
    ids.accounts = await user("accounts@manor.test");
    ids.admin = await user("super@demo.test");
    ids.membership = await one(c, "select id from memberships where tenant_id = $1 and user_id = $2", [ids.manor, ids.manager]);
    ids.barat = await one(c, "select id from event_types where tenant_id = $1 and slug = 'barat'", [ids.manor]);
    ids.gold = await one(c, "select id from packages where event_type_id = $1 and name = 'Gold'", [ids.barat]);
  } finally {
    await c.end();
  }
});

/** SQL that edits the snapshot `s`: sets `value` at `path` inside the row of `part` whose id is `id`. */
const setInRow = (part: string, id: string, path: string, value: string) =>
  `jsonb_set(s, '{${part}}', (select jsonb_agg(case when r ->> 'id' = '${id}' then jsonb_set(r, '{${path}}', '${value}') else r end)
     from jsonb_array_elements(s -> '${part}') r))`;

const GOLD_PRICE = () => setInRow("packages", ids.gold, "pricePerGuestPaisa", "450000");

/** Saves a draft the way the server does (service side), from the live snapshot `s` edited by `edit`. */
async function saveDraft(c: Client | pg.Client, edit: string, tenant = ids.manor) {
  await c.query("reset role");
  await c.query(`insert into site_drafts (tenant_id, payload) select $1, ${edit} from (select public.site_snapshot($1) as s) x`, [tenant]);
}

const goldPrice = (c: Client) => one<number>(c, "select price_per_guest_paisa from packages where id = $1", [ids.gold]);
const draftCount = (c: Client) => one<number>(c, "select count(*)::int from site_drafts where tenant_id = $1", [ids.manor]);

async function override(c: Client, key: string, granted: boolean) {
  await c.query("reset role");
  await c.query(
    `insert into membership_overrides (membership_id, permission_key, granted) values ($1, $2, $3)
     on conflict (membership_id, permission_key) do update set granted = excluded.granted`,
    [ids.membership, key, granted],
  );
}

describe("site_snapshot", () => {
  it("returns the shape SiteDraftSchema parses, for the manager", () =>
    withDb(async (c) => {
      await asUser(c, ids.manager);
      const snap = await one(c, "select public.site_snapshot($1)", [ids.manor]);
      const draft = SiteDraftSchema.parse(snap);
      expect(draft.events.map((e) => e.slug)).toContain("barat");
      expect(draft.packages.find((p) => p.id === ids.gold)?.pricePerGuestPaisa).toBe(420000);
    }));
});

describe("site_diff", () => {
  it("is empty for equal inputs", () =>
    withDb(async (c) => {
      const diff = await one(c, "select public.site_diff(s, s) from (select public.site_snapshot($1) as s) x", [ids.manor]);
      expect(diff).toEqual({ before: {}, after: {} });
    }));
});

describe("publish_site", () => {
  it("publishes a Gold price change: that package only, draft gone, one audit row with only that package", () =>
    withDb(async (c) => {
      const before = (await c.query("select id, price_per_guest_paisa from packages where tenant_id = $1 order by id", [ids.manor])).rows;
      await saveDraft(c, GOLD_PRICE());
      await asUser(c, ids.manager);
      const diff = await one<{ before: Record<string, unknown>; after: Record<string, unknown> }>(c, PUBLISH, [ids.manor, 1]);
      await c.query("reset role");

      const after = (await c.query("select id, price_per_guest_paisa from packages where tenant_id = $1 order by id", [ids.manor])).rows;
      expect(after).toEqual(before.map((p) => (p.id === ids.gold ? { ...p, price_per_guest_paisa: 450000 } : p)));
      expect(await draftCount(c)).toBe(0);

      expect(Object.keys(diff.before)).toEqual(["packages"]);
      expect(Object.keys(diff.after)).toEqual(["packages"]);
      expect(diff.before.packages).toEqual([expect.objectContaining({ id: ids.gold, pricePerGuestPaisa: 420000 })]);
      expect(diff.after.packages).toEqual([expect.objectContaining({ id: ids.gold, pricePerGuestPaisa: 450000 })]);

      const audit = await c.query("select before, after, actor_user_id, entity from audit_events where action = 'site.publish' and tenant_id = $1", [ids.manor]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ before: diff.before, after: diff.after, actor_user_id: ids.manager, entity: "site" });
    }));

  it("refuses a stale revision with site_changed and changes nothing", () =>
    withDb(async (c) => {
      await saveDraft(c, GOLD_PRICE());
      await asUser(c, ids.manager);
      await c.query("savepoint stale");
      await expect(c.query(PUBLISH, [ids.manor, 2])).rejects.toMatchObject({ code: "40001", message: expect.stringMatching(/site_changed/) });
      await c.query("rollback to savepoint stale");
      await c.query("reset role");
      expect(await goldPrice(c)).toBe(420000);
      expect(await draftCount(c)).toBe(1);
    }));

  it("refuses a manager's draft holding a theme change, applies nothing and keeps the draft", () =>
    withDb(async (c) => {
      const theme = await one(c, "select theme from tenant_settings where tenant_id = $1", [ids.manor]);
      await saveDraft(c, `jsonb_set(${GOLD_PRICE()}, '{theme,colors,primary}', '"#123456"')`);
      await asUser(c, ids.manager);
      await expectReject(c, PUBLISH, [ids.manor, 1], /needs tenant\.settings\.edit/);
      await c.query("reset role");
      expect(await goldPrice(c)).toBe(420000);
      expect(await one(c, "select theme from tenant_settings where tenant_id = $1", [ids.manor])).toEqual(theme);
      expect(await draftCount(c)).toBe(1);
    }));

  it("refuses a price change after prices.edit is revoked, keeping the draft", () =>
    withDb(async (c) => {
      await saveDraft(c, GOLD_PRICE());
      await override(c, "prices.edit", false);
      await asUser(c, ids.manager);
      await expectReject(c, PUBLISH, [ids.manor, 1], /needs prices\.edit/);
      await c.query("reset role");
      expect(await goldPrice(c)).toBe(420000);
      expect(await draftCount(c)).toBe(1);
    }));

  it("publishes a draft without the Barat event, its packages and defaultEvent", () =>
    withDb(async (c) => {
      await saveDraft(
        c,
        `jsonb_set(jsonb_set(s #- '{content,packages,defaultEvent}',
           '{events}', (select jsonb_agg(r) from jsonb_array_elements(s -> 'events') r where r ->> 'id' <> '${ids.barat}')),
           '{packages}', coalesce((select jsonb_agg(r) from jsonb_array_elements(s -> 'packages') r where r ->> 'eventTypeId' <> '${ids.barat}'), '[]'))`,
      );
      await asUser(c, ids.manager);
      await c.query(PUBLISH, [ids.manor, 1]);
      await c.query("reset role");
      expect(await one<number>(c, "select count(*)::int from event_types where tenant_id = $1 and slug = 'barat'", [ids.manor])).toBe(0);
      expect(await one<number>(c, "select count(*)::int from packages where event_type_id = $1", [ids.barat])).toBe(0);
      expect(await one<number>(c, "select count(*)::int from event_types where tenant_id = $1", [ids.manor])).toBe(4);
      expect(await one(c, "select content #> '{packages,defaultEvent}' from tenant_settings where tenant_id = $1", [ids.manor])).toBeNull();
    }));

  it("refuses a draft that removes an event but keeps its packages, since the cascade would drop them", () =>
    withDb(async (c) => {
      await saveDraft(
        c,
        `jsonb_set(s, '{events}', (select jsonb_agg(r) from jsonb_array_elements(s -> 'events') r where r ->> 'id' <> '${ids.barat}'))`,
      );
      await asUser(c, ids.manager);
      await expectReject(c, PUBLISH, [ids.manor, 1], /publish could not apply the whole draft/);
      await c.query("reset role");
      expect(await one<number>(c, "select count(*)::int from packages where event_type_id = $1", [ids.barat])).toBeGreaterThan(0);
      expect(await draftCount(c)).toBe(1);
    }));

  it("lets a platform admin change the venue name, which also renames the tenant", () =>
    withDb(async (c) => {
      await saveDraft(c, `jsonb_set(s, '{identity,name}', '"Manor Renamed"')`);
      await asUser(c, ids.admin, "aal2");
      await c.query(PUBLISH, [ids.manor, 1]);
      await c.query("reset role");
      expect(await one(c, "select name from tenants where id = $1", [ids.manor])).toBe("Manor Renamed");
      expect(await one(c, "select identity ->> 'name' from tenant_settings where tenant_id = $1", [ids.manor])).toBe("Manor Renamed");
    }));

  it("refuses a venue name change by a manager, even with tenant.settings.edit", () =>
    withDb(async (c) => {
      await saveDraft(c, `jsonb_set(s, '{identity,name}', '"Manor Renamed"')`);
      await asUser(c, ids.manager);
      await expectReject(c, PUBLISH, [ids.manor, 1], /needs tenant\.settings\.edit/);
      await override(c, "tenant.settings.edit", true);
      await asUser(c, ids.manager);
      await expectReject(c, PUBLISH, [ids.manor, 1], /venue name needs a platform admin/);
      await c.query("reset role");
      expect(await one(c, "select identity ->> 'name' from tenant_settings where tenant_id = $1", [ids.manor])).not.toBe("Manor Renamed");
      expect(await draftCount(c)).toBe(1);
    }));

  it("lets exactly one of two sessions publish the same revision", async () => {
    const setup = new pg.Client({ connectionString: url });
    const [a, b] = [new pg.Client({ connectionString: url }), new pg.Client({ connectionString: url })];
    await Promise.all([setup.connect(), a.connect(), b.connect()]);
    const t = { account: randomUUID(), tenant: randomUUID() };
    try {
      await setup.query("insert into accounts (id, name) values ($1, 'Race')", [t.account]);
      await setup.query("insert into tenants (id, account_id, slug, name) values ($1, $2, $3, 'Race')", [t.tenant, t.account, `race-${t.tenant}`]);
      await saveDraft(setup, `jsonb_set(s, '{theme}', '{"race": 1}')`, t.tenant);

      await a.query("begin");
      await b.query("begin");
      await a.query(PUBLISH, [t.tenant, 1]); // holds the draft row lock
      const bPublish = b.query(PUBLISH, [t.tenant, 1]).then(
        () => "ok",
        (e: Error) => e.message,
      );
      // b must be waiting on a's lock; a commit releases it.
      await new Promise((r) => setTimeout(r, 500));
      await a.query("commit");
      const bResult = await bPublish;
      await b.query(bResult === "ok" ? "commit" : "rollback");

      expect(bResult).toContain("site_changed");
      expect(await one(setup, "select theme from tenant_settings where tenant_id = $1", [t.tenant])).toEqual({ race: 1 });
      expect(await one<number>(setup, "select count(*)::int from audit_events where action = 'site.publish' and tenant_id = $1", [t.tenant])).toBe(1);
    } finally {
      await a.query("rollback").catch(() => {});
      await b.query("rollback").catch(() => {});
      // The audit row stays (audit_events is append-only and has no tenant foreign key).
      await setup.query("delete from tenants where id = $1", [t.tenant]);
      await setup.query("delete from accounts where id = $1", [t.account]);
      await Promise.all([setup.end(), a.end(), b.end()]);
    }
  });
});

describe("site_drafts", () => {
  it("a committed draft leaves the public catalogue and settings unchanged", async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const settings = () => one(c, "select to_jsonb(s) from tenant_settings s where tenant_id = $1", [ids.manor]);
      const [catBefore, setBefore] = [await getPublicCatalogue(ids.manor), await settings()];
      await saveDraft(c, `jsonb_set(${GOLD_PRICE()}, '{identity,phones}', '["+923009999999"]')`);
      expect(await getPublicCatalogue(ids.manor)).toEqual(catBefore);
      expect(await settings()).toEqual(setBefore);
    } finally {
      await c.query("delete from site_drafts where tenant_id = $1", [ids.manor]);
      await c.end();
    }
  });

  it("anon and accounts read no drafts; the manager cannot insert but reads the saved one", () =>
    withDb(async (c) => {
      await asUser(c, ids.manager);
      await expectReject(c, "insert into site_drafts (tenant_id, payload) values ($1, '{}')", [ids.manor], /row-level security/);
      await saveDraft(c, "s");
      await asUser(c, null);
      expect(await draftCount(c)).toBe(0);
      await asUser(c, ids.accounts);
      expect(await draftCount(c)).toBe(0);
      await asUser(c, ids.manager);
      expect(await draftCount(c)).toBe(1);
    }));
});
