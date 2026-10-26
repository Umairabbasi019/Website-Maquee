import { describe, expect, it } from "vitest";
import pg from "pg";
import { getPublicCatalogue } from "@/modules/catalogue";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Reads committed seed data, so run `npm run db:seed` first.
async function tenantId(slug: string): Promise<string> {
  const pool = new pg.Pool({ connectionString: URL });
  try {
    return (await pool.query("select id from tenants where slug = $1", [slug])).rows[0].id;
  } finally {
    await pool.end();
  }
}

describe("getPublicCatalogue (seeded)", () => {
  it("returns the Manor catalogue in order", async () => {
    const cat = await getPublicCatalogue(await tenantId("manor"));
    expect(cat.events.map((e) => e.name)).toEqual(["Mehndi", "Barat", "Valima", "Nikkah", "Corporate"]);
    const gold = cat.events[1].packages.find((p) => p.name === "Gold");
    expect(gold).toMatchObject({ pricePerGuestPaisa: 420000, minGuests: 300, featured: true });
    expect(cat.offers).toHaveLength(3);
    expect(cat.hasSample).toBe(true);
    expect(gold?.id).toMatch(UUID);
    expect(cat.events[1].id).toMatch(UUID);
    expect(cat.offers.every((o) => UUID.test(o.id))).toBe(true);
    expect(cat.addons).toEqual([]);
    expect(cat.stageThemes).toEqual([]);
  });

  it("includes active add-ons and stage themes, and a sample one keeps hasSample true", async () => {
    const id = await tenantId("demo-hall");
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    try {
      await c.query(
        "insert into addons (tenant_id, name, price_paisa, basis, active, sort, sample) values ($1, 'Lights', 2500000, 'flat', true, 2, true), ($1, 'Hidden', 100, 'flat', false, 1, false)",
        [id],
      );
      await c.query("insert into stage_themes (tenant_id, name, description, price_paisa, sort) values ($1, 'Gold', 'd', 15000000, 1)", [id]);
      const cat = await getPublicCatalogue(id);
      expect(cat.addons).toEqual([{ id: expect.stringMatching(UUID), name: "Lights", pricePaisa: 2500000, basis: "flat" }]);
      expect(cat.stageThemes).toMatchObject([{ name: "Gold", pricePaisa: 15000000, mediaKeys: [] }]);
      expect(cat.hasSample).toBe(true);
    } finally {
      await c.query("delete from addons where tenant_id = $1", [id]);
      await c.query("delete from stage_themes where tenant_id = $1", [id]);
      await c.end();
    }
  });

  it("keeps the demo venue free of Manor events", async () => {
    const cat = await getPublicCatalogue(await tenantId("demo-hall"));
    expect(cat.events).toHaveLength(3);
    const manor = new Set(["Mehndi", "Barat", "Valima", "Nikkah", "Corporate"]);
    expect(cat.events.filter((e) => manor.has(e.name))).toEqual([]);
  });
});
