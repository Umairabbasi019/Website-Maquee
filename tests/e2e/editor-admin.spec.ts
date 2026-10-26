import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, PLATFORM_BASE, signIn, signInSuperAdmin, TENANT_BASE } from "./helpers";

// Publishes to the shared demo data; afterAll puts Manor's settings and sample flags back and drops the draft.
const db = openDb();
let manor = "";
const SETTINGS = ["identity", "theme", "sections", "messaging", "content"] as const;
const SAMPLE_TABLES = ["event_types", "packages", "offers", "addons", "stage_themes"] as const;
let settings: Record<string, unknown> = {};
const samples: Record<string, { id: string; sample: boolean }[]> = {};

const dropDraft = () => db.query("delete from site_drafts where tenant_id = $1", [manor]);

test.beforeAll(async () => {
  assertPassword();
  manor = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  settings = (await db.query(`select ${SETTINGS.join(", ")} from tenant_settings where tenant_id = $1`, [manor])).rows[0];
  for (const table of SAMPLE_TABLES) samples[table] = (await db.query(`select id, sample from ${table} where tenant_id = $1`, [manor])).rows;
  await dropDraft(); // an earlier spec or run may have left one
});

test.afterAll(async () => {
  // As JSON text: pg would send the sections array as a Postgres array.
  await db.query(`update tenant_settings set ${SETTINGS.map((c, i) => `${c} = $${i + 2}::jsonb`).join(", ")} where tenant_id = $1`, [
    manor,
    ...SETTINGS.map((c) => JSON.stringify(settings[c])),
  ]);
  for (const table of SAMPLE_TABLES) {
    for (const row of samples[table]) await db.query(`update ${table} set sample = $2 where id = $1`, [row.id, row.sample]);
  }
  await dropDraft();
  await db.end();
});

const editorBar = (page: Page) => page.getByRole("region", { name: en["editor.bar"] });
const editMenu = (page: Page) => editorBar(page).getByRole("group", { name: en["editor.menu"] });

async function openAsManager(page: Page) {
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("link", { name: en["nav.site"] }).click();
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard/site`);
}

async function openAsSuperAdmin(page: Page) {
  await signInSuperAdmin(page);
  await page.getByRole("link", { name: "Manor", exact: true }).click();
  await page.getByRole("link", { name: en["admin.openDashboard"] }).click();
  await expect(page).toHaveURL(`${PLATFORM_BASE}/dashboard`);
  await page.getByRole("link", { name: en["nav.site"] }).click();
  await expect(page).toHaveURL(`${PLATFORM_BASE}/dashboard/site`);
}

async function publish(page: Page) {
  await editorBar(page).getByRole("button", { name: en["editor.publish"] }).click();
  await expect(editorBar(page).getByRole("status")).toHaveText(en["editor.published"]);
}

async function setPrimary(page: Page, hex: string) {
  await editMenu(page).getByRole("button", { name: en["edit.theme"] }).click();
  const dialog = page.getByRole("dialog", { name: en["edit.theme"] });
  await dialog.getByLabel(en["field.color.primary"], { exact: true }).fill(hex);
  await dialog.getByRole("button", { name: en["editor.save"] }).click();
  await expect(dialog).toHaveCount(0);
}

test("a manager changes Sunday's hours and the manager card, publishes, and the contact section shows them", async ({ page, context }) => {
  await openAsManager(page);
  const menu = editMenu(page);
  await expect(menu.getByRole("button", { name: en["edit.hours"] })).toBeVisible();
  for (const name of [en["edit.theme"], en["edit.sectionsOrder"], en["edit.venue"]]) await expect(menu.getByRole("button", { name })).toHaveCount(0);
  await expect(editorBar(page).getByRole("button", { name: en["editor.markReal"] })).toHaveCount(0);

  await menu.getByRole("button", { name: en["edit.hours"] }).click();
  const hours = page.getByRole("dialog", { name: en["edit.hours"] });
  const sunday = hours.getByRole("group", { name: "Sunday" });
  await sunday.getByLabel(en["field.closes"]).fill("23:30");
  await hours.getByRole("button", { name: en["editor.save"] }).click();
  await expect(hours).toHaveCount(0);
  await expect(editorBar(page)).toContainText(en["editor.changes.one"]);

  await page.locator("#contact").getByRole("button", { name: en["edit.manager"] }).click();
  const card = page.getByRole("dialog", { name: en["edit.manager"] });
  await card.getByLabel(en["field.name"]).fill("Bilal");
  await card.getByLabel(en["field.role"]).fill("events lead");
  await card.getByRole("button", { name: en["editor.save"] }).click();
  await expect(card).toHaveCount(0);
  await expect(editorBar(page)).toContainText(en["editor.changes.many"].replace("{count}", "2"));
  await publish(page);

  // Sunday 22:45 in Karachi: after the old 21:30 close, before the new 23:30 one.
  const visitor = await context.newPage();
  await visitor.clock.setFixedTime(new Date("2026-11-01T17:45:00Z"));
  await visitor.goto(TENANT_BASE);
  const contact = visitor.locator("#contact");
  await expect(contact.getByText(/^Open now/)).toBeVisible({ timeout: 30_000 });
  await expect(contact).toContainText("Bilal, events lead");
});

test("the super admin changes a hero line and the primary colour, marks the content real, and the site can be indexed", async ({ page, context }) => {
  await openAsSuperAdmin(page);
  await page.getByRole("button", { name: "Edit hero section" }).click();
  const hero = page.getByRole("dialog", { name: "Edit hero section" });
  await hero.getByRole("group", { name: "arrival", exact: true }).getByRole("textbox", { name: "Lines 1", exact: true }).fill("Never just a venue,");
  await hero.getByRole("button", { name: en["editor.save"] }).click();
  await expect(hero).toHaveCount(0);
  await setPrimary(page, "#1e7a5a");
  await publish(page);

  const visitor = await context.newPage();
  await visitor.goto(TENANT_BASE);
  await expect(visitor.locator("#hero")).toContainText("Never just a venue,");
  await expect(visitor.locator(".site-root")).toHaveAttribute("style", /--color-accent:\s*#1e7a5a/i);
  const noindex = visitor.locator('meta[name="robots"][content*="noindex"]');
  await expect(noindex).toHaveCount(1);

  await editorBar(page).getByRole("button", { name: en["editor.markReal"] }).click();
  await expect(editorBar(page).getByRole("status")).toHaveText(en["editor.markedReal"]);
  await expect(editorBar(page).getByRole("button", { name: en["editor.markReal"] })).toHaveCount(0);
  await publish(page);

  // The catalogue rows are the manager's to make real; here they are cleared directly.
  await visitor.reload();
  await expect(noindex).toHaveCount(1);
  for (const table of SAMPLE_TABLES) await db.query(`update ${table} set sample = false where tenant_id = $1`, [manor]);
  await visitor.reload();
  await expect(visitor.locator("#hero")).toBeVisible();
  await expect(noindex).toHaveCount(0);
});

test("a manager cannot publish a draft holding the super admin's unpublished theme change", async ({ page, browser }) => {
  await openAsSuperAdmin(page);
  await setPrimary(page, "#7a1e3c");
  await expect(editorBar(page)).toContainText(en["editor.changes.one"]);

  const other = await browser.newContext();
  const manager = await other.newPage();
  await openAsManager(manager);
  await editorBar(manager).getByRole("button", { name: en["editor.publish"] }).click();
  const alert = editorBar(manager).getByRole("alert");
  await expect(alert).toContainText(en["editor.blocked"]);
  await expect(alert.getByRole("listitem")).toHaveText(["Theme: colors"]);
  await other.close();
});
