import { expect, test } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, PLATFORM_BASE, shoot, signIn, signInSuperAdmin, TENANT_BASE } from "./helpers";

// These tests change shared demo data; afterAll puts it back so the suite can run again.
const db = openDb();
let demoStatus = "setup";
let manorLimits = { login_limit: 5, manager_limit: 2 };

async function removeTestHall() {
  const { rows } = await db.query("delete from tenants where slug = 'test-hall' returning account_id");
  for (const r of rows) await db.query("delete from accounts where id = $1", [r.account_id]);
}

test.beforeAll(async () => {
  assertPassword();
  await removeTestHall(); // a crashed earlier run may have left it
  demoStatus = (await db.query("select status from tenants where slug = 'demo-hall'")).rows[0].status;
  manorLimits = (await db.query("select login_limit, manager_limit from tenants where slug = 'manor'")).rows[0];
});

test.afterAll(async () => {
  await removeTestHall();
  await db.query("update tenants set status = $1 where slug = 'demo-hall'", [demoStatus]);
  await db.query("update tenants set login_limit = $1, manager_limit = $2 where slug = 'manor'", [
    manorLimits.login_limit,
    manorLimits.manager_limit,
  ]);
  await db.query("delete from tenant_secrets where tenant_id = (select id from tenants where slug = 'manor')");
  await db.end();
});

test("super admin creates Test Hall and sees it with 0/6 checklist items", async ({ page }) => {
  await signInSuperAdmin(page);
  await page.getByRole("link", { name: en["admin.newTenant"] }).click();
  await expect(page.getByRole("heading", { name: en["admin.create.heading"] })).toBeVisible();

  // A taken slug gets a friendly message, not a crash.
  await page.getByLabel(en["admin.create.name"]).fill("Copy of Manor");
  await page.getByLabel(en["admin.create.slug"]).fill("manor");
  await page.getByRole("button", { name: en["admin.create.submit"] }).click();
  await expect(page.getByRole("alert").filter({ hasText: en["admin.slugTaken"] })).toBeVisible();
  await shoot(page, "admin-create-error");

  await page.getByLabel(en["admin.create.name"]).fill("Test Hall");
  await page.getByLabel(en["admin.create.slug"]).fill("test-hall");
  await page.getByRole("button", { name: en["admin.create.submit"] }).click();
  // The first visit compiles the tenant page in dev, which can take longer than the default 5 s.
  await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Test Hall" })).toBeVisible();

  await page.goto(`${PLATFORM_BASE}/admin`);
  const row = page.getByRole("row").filter({ hasText: "Test Hall" });
  await expect(row).toContainText("0/6");
  await expect(row).toContainText(en["status.setup"]);
  await expect(page.getByRole("row").filter({ hasText: "Manor" })).toContainText("5/6");
  await shoot(page, "admin-list");
});

test("pausing demo-hall puts its public site on the holding page", async ({ page }) => {
  await signInSuperAdmin(page);
  await page.getByRole("link", { name: "Demo Hall" }).click();
  await page.getByRole("button", { name: en["admin.setStatus.paused"] }).click();
  await expect(page.getByTestId("tenant-status")).toHaveText(en["status.paused"]);

  await page.goto("http://demo.localhost:3000/");
  await expect(page.getByRole("heading", { name: en["holding.heading"] })).toBeVisible();
  await expect(page.getByText(en["holding.body"])).toBeVisible();
  await shoot(page, "holding-page");
});

test("manager of Manor gets 403 on /admin, and tenant hosts have no /admin", async ({ page }) => {
  await page.goto(`${TENANT_BASE}/admin`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();

  await signIn(page, "manager1@manor.test", PLATFORM_BASE);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/dashboard`);
  await page.goto(`${PLATFORM_BASE}/admin`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
});

test("lowering Manor's manager limit below its 2 active managers is rejected", async ({ page }) => {
  await signInSuperAdmin(page);
  await page.getByRole("link", { name: "Manor", exact: true }).click();
  await page.getByLabel(en["admin.managerLimit"]).fill("1");
  await page.getByRole("button", { name: en["admin.saveLimits"] }).click();
  await expect(page.getByRole("alert").filter({ hasText: en.managerLimitReached })).toBeVisible();
  const { rows } = await db.query("select manager_limit from tenants where slug = 'manor'");
  expect(rows[0].manager_limit).toBe(manorLimits.manager_limit);

  // Secrets are write-only: after saving, the page shows only the date.
  const field = page.getByLabel(en["secret.whatsapp"], { exact: true });
  await field.fill("test-token-not-real");
  await page.getByRole("button", { name: `${en["admin.saveSecret"]}: ${en["secret.whatsapp"]}` }).click();
  await expect(page.getByTestId("secret-whatsapp")).toContainText(en["admin.secretSavedOn"]);
  await expect(field).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("test-token-not-real");
  await shoot(page, "admin-tenant");

  await page.getByRole("link", { name: en["admin.openDashboard"] }).click();
  await expect(page).toHaveURL(`${PLATFORM_BASE}/dashboard`);
  await expect(page.getByRole("region", { name: en["banner.label"] })).toContainText("Manor");
  await shoot(page, "admin-open-dashboard");
});
