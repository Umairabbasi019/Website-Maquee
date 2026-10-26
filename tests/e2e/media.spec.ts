import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, signIn, TENANT_BASE } from "./helpers";

// Needs the demo data: run `npm run db:seed` first.
const db = openDb();
let ids: { manor: string; demo: string };

test.beforeAll(async () => {
  assertPassword();
  const { rows } = await db.query("select slug, id from tenants where slug in ('manor', 'demo-hall')");
  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id as string]));
  ids = { manor: bySlug.manor, demo: bySlug["demo-hall"] };
});
test.afterAll(() => db.end());

async function openMedia(page: Page, email = "manager1@manor.test") {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`${TENANT_BASE}/dashboard/media`);
}

const uploadRegion = (page: Page) => page.getByRole("region", { name: en["media.uploadHeading"] });

test("a manager uploads a photo: sizes and dims stored, files served from the venue's folder, then deletes it", async ({ page, request }) => {
  await openMedia(page);
  const alt = `E2E upload ${Date.now()}`;
  const jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#7a3b5c" } }).jpeg().toBuffer();
  const form = uploadRegion(page);
  await form.getByLabel(en["media.file"]).setInputFiles({ name: "E2E Hall.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await form.getByLabel(en["media.alt"]).fill(alt);
  await form.getByRole("button", { name: en["media.upload"] }).click();
  await expect(form.getByRole("status")).toHaveText(en["media.uploaded"]);

  const card = page.locator("li[data-key]", { hasText: alt });
  await expect(card).toBeVisible();
  const { rows } = await db.query("select key, sizes, dims, ext from media_assets where tenant_id = $1 and alt = $2", [ids.manor, alt]);
  expect(rows).toHaveLength(1);
  const row = rows[0] as { key: string; sizes: string[]; dims: Record<string, [number, number]>; ext: string };
  expect(row.key).toMatch(/^e2e-hall-[0-9a-f]{6}$/);
  // 2400 px is longer than the m target (1920), so l is made at the photo's own size (never upscaled).
  expect(row.sizes).toEqual(["s", "m", "l"]);
  expect(row.dims).toEqual({ s: [1280, 853], m: [1920, 1280], l: [2400, 1600] });
  expect(row.ext).toBe("jpg");

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/${ids.manor}/${row.key}`;
  for (const size of row.sizes) {
    const res = await request.get(`${base}/${size}.jpg`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/jpeg");
  }
  await expect(card.locator("img")).toHaveAttribute("src", `${base}/s.jpg`);

  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: en["media.delete"] }).click();
  await expect(card).toHaveCount(0);
  expect((await db.query("select 1 from media_assets where tenant_id = $1 and key = $2", [ids.manor, row.key])).rows).toHaveLength(0);
  expect((await request.get(`${base}/s.jpg`)).ok()).toBe(false);
});

test("a text file renamed .jpg is refused by content", async ({ page }) => {
  await openMedia(page);
  const form = uploadRegion(page);
  await form.getByLabel(en["media.file"]).setInputFiles({ name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a photo at all") });
  await form.getByLabel(en["media.alt"]).fill("Should not upload");
  await form.getByRole("button", { name: en["media.upload"] }).click();
  await expect(form.getByRole("alert")).toHaveText(en["media.error.type"]);
  expect((await db.query("select 1 from media_assets where alt = 'Should not upload'")).rows).toHaveLength(0);
});

test("a photo in use cannot be deleted and says where it is used", async ({ page }) => {
  await openMedia(page);
  const card = page.locator('li[data-key="stage-floral"]');
  await expect(card).toContainText(/Used in .*Barat background/);
  await expect(card.getByRole("button", { name: en["media.delete"] })).toBeDisabled();
});

test("replacing a photo keeps its alt text and swaps it in the draft", async ({ page }) => {
  await openMedia(page);
  const old = (await db.query("select alt from media_assets where tenant_id = $1 and key = 'chandelier'", [ids.manor])).rows[0].alt as string;
  const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#203040" } }).jpeg().toBuffer();
  const card = page.locator('li[data-key="chandelier"]');
  await card.getByLabel(en["media.replaceFile"]).setInputFiles({ name: "Chandelier New.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await card.getByRole("button", { name: en["media.replace"], exact: true }).click();
  await expect(card.getByRole("status")).toHaveText(en["media.replaced"]);

  const { rows } = await db.query("select key from media_assets where tenant_id = $1 and key like 'chandelier-new-%' and alt = $2", [ids.manor, old]);
  expect(rows).toHaveLength(1);
  const draft = (await db.query("select payload from site_drafts where tenant_id = $1", [ids.manor])).rows[0].payload;
  const tiles = (draft.content.gallery.tiles as { key: string }[]).map((t) => t.key);
  expect(tiles).toContain(rows[0].key);
  expect(tiles).not.toContain("chandelier");

  // Clean up: drop the draft, then the new photo is unused and the UI may delete it.
  await db.query("delete from site_drafts where tenant_id = $1", [ids.manor]);
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page.locator(`li[data-key="${rows[0].key}"]`).getByRole("button", { name: en["media.delete"] }).click();
  await expect(page.locator(`li[data-key="${rows[0].key}"]`)).toHaveCount(0);
});

test("the Manor library lists only Manor's photos", async ({ page }) => {
  await openMedia(page);
  await expect(page.locator('li[data-key="stage-floral"]')).toBeVisible();
  await expect(page.locator('li[data-key^="demo-"]')).toHaveCount(0);
  for (const src of await page.locator("li[data-key] img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src")))) {
    expect(src).toContain(`/venue-media/${ids.manor}/`);
    expect(src).not.toContain(ids.demo);
  }
});

test("staff without media.manage get the forbidden notice", async ({ page }) => {
  await signIn(page, "staff@manor.test");
  await expect(page).toHaveURL(/\/dashboard\/schedule/);
  await page.goto(`${TENANT_BASE}/dashboard/media`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
  await expect(uploadRegion(page)).toHaveCount(0);
});
