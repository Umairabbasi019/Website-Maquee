import { describe, expect, it } from "vitest";
import pg from "pg";
import { getPublicCatalogue } from "@/modules/catalogue";

// Reads committed seed data, so run `npm run db:seed` first.
async function tenantId(slug: string): Promise<string> {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
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
  });

  it("keeps the demo venue free of Manor events", async () => {
    const cat = await getPublicCatalogue(await tenantId("demo-hall"));
    expect(cat.events).toHaveLength(3);
    const manor = new Set(["Mehndi", "Barat", "Valima", "Nikkah", "Corporate"]);
    expect(cat.events.filter((e) => manor.has(e.name))).toEqual([]);
  });
});
