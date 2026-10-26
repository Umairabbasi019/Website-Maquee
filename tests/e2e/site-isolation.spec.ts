import { expect, test, type Page } from "@playwright/test";
import { openDb, TENANT_BASE } from "./helpers";

const DEMO_BASE = "http://demo.localhost:3000";
const db = openDb();
let ids: { manor: string; demo: string };

test.beforeAll(async () => {
  const { rows } = await db.query("select slug, id from tenants where slug in ('manor', 'demo-hall')");
  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id as string]));
  ids = { manor: bySlug.manor, demo: bySlug["demo-hall"] };
  expect(ids.manor && ids.demo).toBeTruthy();
});
test.afterAll(() => db.end());

/** Every image URL the page uses: CSS background images, <img src> and srcset candidates, and the og:image meta. */
const imageUrls = (page: Page) =>
  page.evaluate(() => {
    const urls = [...document.querySelectorAll("*")].flatMap((el) =>
      [...getComputedStyle(el).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]),
    );
    document.querySelectorAll("img").forEach((img) => {
      urls.push(img.getAttribute("src") ?? "");
      urls.push(...img.srcset.split(",").map((c) => c.trim().split(" ")[0]));
    });
    document.querySelectorAll('meta[property="og:image"]').forEach((m) => urls.push(m.getAttribute("content") ?? ""));
    // data: URIs (the film grain) are generated, not venue media.
    return urls.filter((u) => /^https?:/.test(u));
  });

test("the demo venue shows only its own media and words", async ({ page }) => {
  await page.goto(DEMO_BASE);
  const urls = await imageUrls(page);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url).toContain(`/venue-media/${ids.demo}/`);
    expect(url).not.toContain(ids.manor);
  }
  const text = await page.locator("body").innerText();
  for (const word of ["Manor", "Ahmed", "Islamabad"]) expect(text).not.toContain(word);
});

test("Manor shows none of the demo venue's media", async ({ page }) => {
  await page.goto(TENANT_BASE);
  const urls = await imageUrls(page);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) expect(url).not.toContain(ids.demo);
});
