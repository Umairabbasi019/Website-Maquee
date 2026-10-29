import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, PLATFORM_BASE, signIn, signInSuperAdmin, TENANT_BASE } from "./helpers";

// Changes Manor's hall price, date prices and money rules; afterAll puts them back.
const db = openDb();
let manor = "";
let saved: { hirePrice: number | null; moneyRules: unknown; publicText: string };
const LABELS = ["Wedding season", "E2E overlap"];

const publicText = async (page: Page) => {
  await page.goto(TENANT_BASE);
  return page.locator("main").innerText();
};

test.beforeAll(async () => {
  assertPassword();
  manor = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  const hall = await db.query("select hire_price_paisa from halls where tenant_id = $1 and name = 'Main hall'", [manor]);
  const rules = await db.query("select money_rules from tenant_settings where tenant_id = $1", [manor]);
  saved = { hirePrice: hall.rows[0].hire_price_paisa, moneyRules: rules.rows[0].money_rules, publicText: "" };
  await db.query("delete from date_prices where tenant_id = $1 and label = any($2)", [manor, LABELS]);
});

test.afterAll(async () => {
  await db.query("update halls set hire_price_paisa = $2 where tenant_id = $1 and name = 'Main hall'", [manor, saved.hirePrice]);
  await db.query("update tenant_settings set money_rules = $2::jsonb where tenant_id = $1", [manor, JSON.stringify(saved.moneyRules)]);
  await db.query("delete from date_prices where tenant_id = $1 and label = any($2)", [manor, LABELS]);
  await db.end();
});

test.describe.configure({ mode: "serial" });

test("the public page before any settings change", async ({ page }) => {
  saved.publicText = await publicText(page);
  expect(saved.publicText.length).toBeGreaterThan(0);
});

test("a manager sets the hall hire price, date prices and the estimate switch, but no slots or other money rules", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("link", { name: en["nav.settings"] }).click();
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard/settings`);

  await expect(page.getByRole("heading", { name: en["settings.halls"] })).toBeVisible();
  await expect(page.getByRole("heading", { name: en["settings.datePrices"] })).toBeVisible();
  await expect(page.getByRole("heading", { name: en["settings.slots"] })).toHaveCount(0);
  // prices.edit shows Money rules with only the estimate switch editable.
  await expect(page.getByRole("heading", { name: en["settings.moneyRules"] })).toBeVisible();
  const money = page.getByRole("form", { name: en["settings.moneyRules"] });
  await expect(money).toContainText(en["settings.money.limited"]);
  for (const label of ["settings.money.tax", "settings.money.advance", "settings.money.hold", "settings.money.method.bank"] as const) {
    await expect(money.getByLabel(en[label])).toBeDisabled();
  }
  // The mode switch (instant booking, card gateway) needs bookings.edit and payments.verify, which a manager holds.
  await expect(money.getByLabel(en["settings.money.instant"])).toBeEnabled();
  await expect(money.getByLabel(en["settings.money.method.gateway"])).toBeEnabled();
  const estimate = money.getByLabel(en["settings.money.estimate"]);
  await expect(estimate).toBeEnabled();
  await expect(estimate).toBeChecked();
  await estimate.uncheck();
  await money.getByRole("button", { name: en["settings.save"] }).click();
  await expect(money.getByRole("status")).toHaveText(en["settings.saved"]);
  const ruled = await db.query("select money_rules from tenant_settings where tenant_id = $1", [manor]);
  expect(ruled.rows[0].money_rules).toMatchObject({ showPriceEstimate: false, advancePercent: 50 });

  const hall = page.getByRole("form", { name: "Main hall" });
  for (const label of ["settings.hall.name", "settings.hall.capacityMin", "settings.hall.capacityMax", "settings.hall.active"] as const) {
    await expect(hall.getByLabel(en[label])).toBeDisabled();
  }
  await expect(page.getByRole("form", { name: en["settings.halls.new"] })).toHaveCount(0);
  await hall.getByLabel(en["settings.hall.hirePrice"]).fill("250,000");
  await hall.getByRole("button", { name: en["settings.save"] }).click();
  await expect(hall.getByRole("status")).toHaveText(en["settings.saved"]);
  const stored = await db.query("select hire_price_paisa from halls where tenant_id = $1 and name = 'Main hall'", [manor]);
  expect(stored.rows[0].hire_price_paisa).toBe(25_000_000);

  const add = page.getByRole("form", { name: en["settings.datePrices.new"] });
  const fillRange = async (label: string, from: string, to: string, value: string) => {
    await add.getByLabel(en["settings.datePrice.label"]).fill(label);
    await add.getByLabel(en["settings.datePrice.startsOn"]).fill(from);
    await add.getByLabel(en["settings.datePrice.endsOn"]).fill(to);
    await expect(add.getByLabel(en["settings.datePrice.eventType"])).toHaveValue("");
    await add.getByLabel(en["settings.datePrice.value"]).fill(value);
    await add.getByRole("button", { name: en["settings.add"] }).click();
  };
  await fillRange("Wedding season", "2026-12-01", "2026-12-10", "20");
  await expect(page.getByRole("form", { name: "Wedding season" })).toBeVisible();
  const rows = await db.query("select starts_on::text, ends_on::text, event_type_id, kind, value from date_prices where tenant_id = $1 and label = 'Wedding season'", [manor]);
  expect(rows.rows).toEqual([{ starts_on: "2026-12-01", ends_on: "2026-12-10", event_type_id: null, kind: "percent", value: 20 }]);

  await fillRange("E2E overlap", "2026-12-05", "2026-12-15", "10");
  await expect(add.getByRole("alert")).toHaveText(en["settings.error.overlap"]);
  expect((await db.query("select 1 from date_prices where tenant_id = $1 and label = 'E2E overlap'", [manor])).rows).toHaveLength(0);

  // Another venue's id in the form is refused with a message, and that venue's rule is untouched.
  const demo = (await db.query("select id from tenants where slug = 'demo-hall'")).rows[0].id;
  const other = await db.query(
    "insert into date_prices (tenant_id, starts_on, ends_on, kind, value, label) values ($1, '2027-01-01', '2027-01-02', 'percent', 5, 'E2E overlap') returning id",
    [demo],
  );
  const season = page.getByRole("form", { name: "Wedding season" });
  await season.locator('input[name="id"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), other.rows[0].id);
  await season.getByRole("button", { name: en["settings.save"] }).click();
  await expect(season.getByRole("alert")).toHaveText(en["settings.error.notFound"]);
  const untouched = await db.query("select value, label from date_prices where id = $1", [other.rows[0].id]);
  expect(untouched.rows).toEqual([{ value: 5, label: "E2E overlap" }]);
  await db.query("delete from date_prices where id = $1", [other.rows[0].id]);
});

test("accounts gets the forbidden notice", async ({ page }) => {
  await signIn(page, "accounts@manor.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`${TENANT_BASE}/dashboard/settings`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
  await expect(page.getByRole("heading", { name: en["settings.halls"] })).toHaveCount(0);
});

test("the super admin changes the advance to 40 % and it is audited", async ({ page }) => {
  const since = (await db.query("select now() as now")).rows[0].now;
  await signInSuperAdmin(page);
  await page.getByRole("link", { name: "Manor", exact: true }).click();
  await page.getByRole("link", { name: en["admin.openDashboard"] }).click();
  await page.getByRole("link", { name: en["nav.settings"] }).click();
  await expect(page).toHaveURL(`${PLATFORM_BASE}/dashboard/settings`);
  await expect(page.getByRole("heading", { name: en["settings.slots"] })).toBeVisible();

  const money = page.getByRole("form", { name: en["settings.moneyRules"] });
  await money.getByLabel(en["settings.money.advance"]).fill("40");
  await money.getByRole("button", { name: en["settings.save"] }).click();
  await expect(money.getByRole("status")).toHaveText(en["settings.saved"]);

  const rules = await db.query("select money_rules from tenant_settings where tenant_id = $1", [manor]);
  expect(rules.rows[0].money_rules).toMatchObject({ advancePercent: 40, holdHours: 48 });
  expect(rules.rows[0].money_rules).not.toHaveProperty("currency");
  const audit = await db.query(
    "select before, after from audit_events where tenant_id = $1 and action = 'settings.money_rules' and created_at >= $2",
    [manor, since],
  );
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].after).toMatchObject({ advancePercent: 40 });
});

test("nothing on the public page changed", async ({ page }) => {
  expect(await publicText(page)).toBe(saved.publicText);
});
