import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, signIn, TENANT_BASE } from "./helpers";

// Publishes to the shared demo data; afterAll puts the Barat packages back and drops the draft so the suite can run again.
const db = openDb();
let manor = "";
type PackageRow = { id: string; price_per_guest_paisa: number; items: string[]; sample: boolean };
let barat: PackageRow[] = [];

const dropDraft = () => db.query("delete from site_drafts where tenant_id = $1", [manor]);

test.beforeAll(async () => {
  assertPassword();
  manor = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  barat = (
    await db.query(
      `select p.id, p.price_per_guest_paisa, p.items, p.sample from packages p
       join event_types e on e.id = p.event_type_id where e.tenant_id = $1 and e.slug = 'barat'`,
      [manor],
    )
  ).rows;
  await dropDraft(); // an earlier spec or run may have left one
});

test.afterAll(async () => {
  for (const p of barat) {
    await db.query("update packages set price_per_guest_paisa = $2, items = $3, sample = $4 where id = $1", [
      p.id,
      p.price_per_guest_paisa,
      p.items,
      p.sample,
    ]);
  }
  await dropDraft();
  await db.end();
});

const GOLD_ITEMS = ["Mutton Qorma, Karahi, Biryani", "Live BBQ station", "Two desserts and ice cream", "Floral stage and entrance"];

/** The Gold card in the Barat panel (Mehndi and Valima have a Gold package too). */
const baratCard = (page: Page | ReturnType<Page["frameLocator"]>, name: string) =>
  page.locator("#packages-panel-barat > div").filter({ has: page.locator("h4", { hasText: new RegExp(`^${name}$`) }) });

async function openEditor(page: Page) {
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("link", { name: en["nav.site"] }).click();
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard/site`);
}

const editorBar = (page: Page) => page.getByRole("region", { name: en["editor.bar"] });

test("a manager changes the Gold Barat price and menu, previews it on a phone and publishes", async ({ page, context }) => {
  const started = new Date();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const bar = editorBar(page);
  await expect(bar).toContainText(en["editor.changes.none"]);

  // Section copy is the super admin's, so a manager gets no ✎ there.
  await expect(page.getByRole("button", { name: "Edit hero section" })).toHaveCount(0);

  // Keyboard: Tab reaches the ✎, Enter opens the panel, Escape closes it and focus is back on the ✎.
  const panel = page.locator("#packages-panel-barat");
  const edit = panel.getByRole("button", { name: "Edit Gold package" });
  await panel.getByRole("link", { name: "Choose Silver" }).focus();
  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit Gold package" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();

  await edit.click();
  await dialog.getByLabel(en["field.pricePerGuest"]).fill("4,500");
  await dialog.getByRole("button", { name: en["field.items.add"] }).click();
  await dialog.getByRole("textbox", { name: `${en["field.item"]} 5` }).fill("Live BBQ station");
  await dialog.getByRole("button", { name: en["editor.save"] }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bar).toContainText(en["editor.changes.one"]);
  await expect(baratCard(page, "Gold")).toContainText("Rs 4,500");

  // Draft isolation: the public page (and its JSON-LD) still shows the published package.
  const visitor = await context.newPage();
  await visitor.goto(TENANT_BASE);
  await expect(baratCard(visitor, "Gold")).toContainText("Rs 4,200");
  await expect(baratCard(visitor, "Gold").locator("li")).toHaveText(GOLD_ITEMS);
  const ld = await visitor.locator('script[type="application/ld+json"]').textContent();
  expect(ld).not.toContain("4,500");
  expect(ld).not.toContain("450000");

  // Phone preview: the draft at 375 px in a frame.
  await bar.getByRole("button", { name: en["editor.view.phone"] }).click();
  const frame = page.locator(`iframe[title="${en["editor.previewTitle"]}"]`);
  await expect(frame).toBeVisible();
  expect((await frame.boundingBox())?.width).toBe(375);
  await expect(baratCard(page.frameLocator(`iframe[title="${en["editor.previewTitle"]}"]`), "Gold")).toContainText("Rs 4,500");
  await bar.getByRole("button", { name: en["editor.view.laptop"] }).click();
  await expect(frame).toHaveCount(0);

  await bar.getByRole("button", { name: en["editor.publish"] }).click();
  await expect(bar.getByRole("status")).toHaveText(en["editor.published"]);
  await expect(bar).toContainText(en["editor.changes.none"]);

  await visitor.reload();
  await expect(baratCard(visitor, "Gold")).toContainText("Rs 4,500");
  await expect(baratCard(visitor, "Gold").locator("li")).toHaveText([...GOLD_ITEMS, "Live BBQ station"]);

  const audit = await db.query(
    `select a.actor_user_id from audit_events a where a.action = 'site.publish' and a.tenant_id = $1 and a.created_at >= $2`,
    [manor, started],
  );
  const manager1 = (await db.query("select id from auth.users where email = 'manager1@manor.test'")).rows[0].id;
  expect(audit.rows).toEqual([{ actor_user_id: manager1 }]);

  // At 375 px the panel fills the screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await edit.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.boundingBox()).toMatchObject({ x: 0, width: 375 });
  await dialog.getByRole("button", { name: en["editor.close"] }).click();
  await expect(edit).toBeFocused();
});

test("publishing a draft someone else already published says the site changed", async ({ page, browser }) => {
  await openEditor(page);
  const edit = page.locator("#packages-panel-barat").getByRole("button", { name: "Edit Silver package" });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit Silver package" });
  await dialog.getByLabel(en["field.pricePerGuest"]).fill("3,300");
  await dialog.getByRole("button", { name: en["editor.save"] }).click();
  await expect(editorBar(page)).toContainText(en["editor.changes.one"]);

  const other = await browser.newContext();
  const second = await other.newPage();
  await openEditor(second);
  await editorBar(second).getByRole("button", { name: en["editor.publish"] }).click();
  await expect(editorBar(second).getByRole("status")).toHaveText(en["editor.published"]);
  await other.close();

  await editorBar(page).getByRole("button", { name: en["editor.publish"] }).click();
  await expect(editorBar(page).getByRole("alert")).toContainText(en["editor.siteChanged"]);
});

test("the phone preview is noindex and refused to staff without an editing key", async ({ page }) => {
  await openEditor(page);
  await page.goto(`${TENANT_BASE}/site-preview`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("#packages")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "accounts@manor.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`${TENANT_BASE}/site-preview`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
  await expect(page.locator("#packages")).toHaveCount(0);
});
