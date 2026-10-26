import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { ROW_VALUE_SCHEMAS } from "@/modules/catalogue";
import { createServiceClient, ForbiddenError } from "@/modules/access";
import { asUser, closeDb, withDb } from "./helpers";
import { SiteDraftSchema, writeDraft, type DraftChange, type SiteDraft } from "@/modules/editor";

// Copies the seeded Manor venue into a throwaway venue, so the committed drafts here never meet the
// Manor drafts other test files write at the same time. Run `npm run db:seed` first.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const c = new pg.Client({ connectionString: url });
const db = createServiceClient();
const t = { account: randomUUID(), tenant: randomUUID() };
const ali = { id: randomUUID(), name: "Ali" };
const sara = { id: randomUUID(), name: "Sara" };
const all = () => true;

const copyRows = (table: string, extra = "") =>
  `insert into ${table} select (jsonb_populate_record(null::${table},
     to_jsonb(r) || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', $2::uuid) ${extra})).*
   from ${table} r where r.tenant_id = $1`;

beforeAll(async () => {
  await c.connect();
  const manor = (await c.query("select id from tenants where slug = 'manor'")).rows[0].id;
  await c.query("insert into accounts (id, name) values ($1, 'Draft test')", [t.account]);
  await c.query("insert into tenants (id, account_id, slug, name) values ($1, $2, $3, 'Manor copy')", [t.tenant, t.account, `draft-${t.tenant}`]);
  await c.query(
    `update tenant_settings d set identity = s.identity, theme = s.theme, sections = s.sections, messaging = s.messaging,
       content = s.content, money_rules = s.money_rules from tenant_settings s where s.tenant_id = $1 and d.tenant_id = $2`,
    [manor, t.tenant],
  );
  await c.query(copyRows("event_types"), [manor, t.tenant]);
  await c.query(copyRows("offers"), [manor, t.tenant]);
  await c.query(
    copyRows(
      "packages",
      `|| jsonb_build_object('event_type_id', (select n.id from event_types o join event_types n on n.slug = o.slug
           where o.id = r.event_type_id and n.tenant_id = $2))`,
    ),
    [manor, t.tenant],
  );
});

afterAll(async () => {
  await c.query("delete from tenants where id = $1", [t.tenant]);
  await c.query("delete from accounts where id = $1", [t.account]);
  await c.end();
  await closeDb();
});

const row = async () =>
  (await c.query("select revision::int8::text as revision, payload, changes from site_drafts where tenant_id = $1", [t.tenant])).rows[0] as
    | { revision: string; payload: SiteDraft; changes: Record<string, { by: string; name: string; at: string }> }
    | undefined;
const snapshot = async () => SiteDraftSchema.parse((await c.query("select public.site_snapshot($1) as s", [t.tenant])).rows[0].s);

function goldChange(draft: SiteDraft, price: number): DraftChange {
  const gold = draft.packages.find((p) => p.name === "Gold")!;
  return { kind: "package", id: gold.id, value: { ...ROW_VALUE_SCHEMAS.package.parse(gold), pricePerGuestPaisa: price } };
}

function offerChange(draft: SiteDraft, title: string, id = draft.offers[0].id): DraftChange {
  return { kind: "offer", id, value: { ...ROW_VALUE_SCHEMAS.offer.parse(draft.offers[0]), title } };
}

describe("writeDraft", () => {
  it("creates the draft from the published snapshot on the first save", async () => {
    const live = await snapshot();
    expect(await row()).toBeUndefined();
    await writeDraft(db, t.tenant, goldChange(live, 450000), ali, all);
    const saved = await row();
    const expected = structuredClone(live);
    const gold = expected.packages.find((p) => p.name === "Gold")!;
    Object.assign(gold, { pricePerGuestPaisa: 450000, sample: false });
    expect(saved?.payload).toEqual(expected);
    expect(Object.keys(saved!.changes)).toEqual([`package:${gold.id}`]);
  });

  it("keeps both of two saves started together (Review Focus 1)", async () => {
    const before = (await row())!;
    const live = await snapshot();
    const [a, b] = await Promise.all([
      writeDraft(db, t.tenant, goldChange(live, 460000), ali, all),
      writeDraft(db, t.tenant, offerChange(live, "Winter offer"), sara, all),
    ]);
    const after = (await row())!;
    expect(BigInt(after.revision)).toBeGreaterThan(BigInt(before.revision));
    expect(new Set([String(a.revision), String(b.revision)]).size).toBe(2);
    expect(after.payload.packages.find((p) => p.name === "Gold")!.pricePerGuestPaisa).toBe(460000);
    expect(after.payload.offers[0].title).toBe("Winter offer");
    const gold = live.packages.find((p) => p.name === "Gold")!;
    expect(after.changes).toEqual({
      [`package:${gold.id}`]: expect.objectContaining({ by: ali.id, name: "Ali" }),
      [`offer:${live.offers[0].id}`]: expect.objectContaining({ by: sara.id, name: "Sara" }),
    });
  });

  it("refuses a change that fails SiteDraftSchema and leaves the row as it was", async () => {
    const before = await row();
    await expect(
      writeDraft(db, t.tenant, { kind: "settings", part: "identity", path: ["phones", "0"], value: "" }, ali, all),
    ).rejects.toThrow();
    expect(await row()).toEqual(before);
  });

  it("refuses a change the actor holds no key for and leaves the row as it was", async () => {
    const before = await row();
    const live = await snapshot();
    await expect(writeDraft(db, t.tenant, goldChange(live, 470000), ali, (k) => k !== "prices.edit")).rejects.toThrow(ForbiddenError);
    expect(await row()).toEqual(before);
  });

  it("gives a new row a server id, never the one the client sent", async () => {
    const live = await snapshot();
    const clientId = randomUUID();
    await writeDraft(db, t.tenant, offerChange(live, "Brand new offer", clientId), ali, all);
    const saved = (await row())!;
    const created = saved.payload.offers.find((o) => o.title === "Brand new offer");
    expect(created).toBeDefined();
    expect(created!.id).not.toBe(clientId);
    expect(saved.payload.offers.map((o) => o.id)).not.toContain(clientId);
    expect(Object.keys(saved.changes)).toContain(`offer:${created!.id}`);
  });
});

describe("save_site_draft", () => {
  it.each([["a site editor", true], ["anon", false]])("cannot be called by %s", (_who, signedIn) =>
    withDb(async (w) => {
      const manager = (await w.query("select id from auth.users where email = 'manager1@manor.test'")).rows[0].id;
      await asUser(w, signedIn ? manager : null);
      await expect(w.query("select public.save_site_draft($1, 1, '{}', '{}')", [t.tenant])).rejects.toThrow(/permission denied/);
    }));
});
