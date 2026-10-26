import { describe, expect, it } from "vitest";
import pg from "pg";
import { getPublicMedia } from "@/modules/media";
import { demoCatalogue, demoContent } from "../../scripts/seed-data/demo";
import { manorCatalogue, manorContent, manorTheme } from "../../scripts/seed-data/manor";

// Reads committed seed data, so run `npm run db:seed` first.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const tenantId = async (slug: string): Promise<string> =>
  (await pool.query("select id from tenants where slug = $1", [slug])).rows[0].id;

const KEY_FIELDS = new Set(["key", "mediaKey", "image", "logo"]);

/** Every media key a venue's seed data refers to: MediaRef/tile `key`, event `mediaKey`, `seo.image`, `theme.logo`. */
function referencedKeys(...data: unknown[]): Set<string> {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (KEY_FIELDS.has(k) && typeof x === "string") keys.add(x);
        else walk(x);
      }
    }
  };
  data.forEach(walk);
  return keys;
}

describe("getPublicMedia (seeded)", () => {
  it("gives Manor three sizes under its own tenant prefix", async () => {
    const id = await tenantId("manor");
    const media = await getPublicMedia(id);
    const urls = media["ext-night"].urls;
    for (const size of ["s", "m", "l"] as const) {
      expect(urls[size]).toMatch(new RegExp(`/venue-media/${id}/ext-night/${size}\.jpg$`));
    }
    expect(media.logo.urls.m).toMatch(/\/logo\/m\.png$/);
    expect(media["ext-night"].alt.length).toBeGreaterThan(0);
    const res = await fetch(urls.m!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("keeps demo keys under demo- and out of Manor", async () => {
    const demo = await getPublicMedia(await tenantId("demo-hall"));
    expect(Object.keys(demo).every((k) => k.startsWith("demo-"))).toBe(true);
    expect(Object.keys(await getPublicMedia(await tenantId("manor"))).some((k) => k.startsWith("demo-"))).toBe(false);
  });

  it.each([
    ["manor", [manorContent, manorCatalogue, manorTheme]],
    ["demo-hall", [demoContent, demoCatalogue]],
  ])("has an asset for every key %s content references", async (slug, data) => {
    const media = await getPublicMedia(await tenantId(slug));
    const missing = [...referencedKeys(...data)].filter((k) => !media[k]);
    expect(missing).toEqual([]);
  });
});
