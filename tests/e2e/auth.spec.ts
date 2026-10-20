import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { generate } from "otplib";
import pg from "pg";
import { en } from "../../src/ui/i18n/en";

// Needs the demo data: run `npm run db:seed` before `npm run test:e2e`.
const BASE = "http://manor.localhost:3000";
const SHOTS = "e2e-shots"; // git-ignored
const password = process.env.SEED_USER_PASSWORD ?? "";
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});

test.beforeAll(() => {
  if (!password) throw new Error("SEED_USER_PASSWORD is not set (see .env.example)");
});
test.afterAll(() => db.end());

async function signIn(page: Page, email: string, pass = password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(en["login.email"]).fill(email);
  await page.getByLabel(en["login.password"]).fill(pass);
  await page.getByRole("button", { name: en["login.submit"] }).click();
}

async function shoot(page: Page, name: string) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
}

test("wrong password shows one generic error", async ({ page }) => {
  await signIn(page, "manager1@manor.test", "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: en["login.failed"] })).toBeVisible();
  await shoot(page, "login-error");
  await signIn(page, "nobody@manor.test", "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: en["login.failed"] })).toBeVisible();
});

test("manager sees no Users link and gets 403 on /dashboard/users", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(`${BASE}/dashboard`);
  const nav = page.getByRole("navigation", { name: en["nav.label"] });
  await expect(nav.getByRole("link", { name: en["nav.bookings"] })).toBeVisible();
  await expect(nav.getByRole("link", { name: en["nav.users"] })).toHaveCount(0);
  await shoot(page, "dashboard-manager");

  await page.goto(`${BASE}/dashboard/users`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
  await shoot(page, "dashboard-forbidden");
});

test("staff lands on the schedule, the only screen they hold", async ({ page }) => {
  await signIn(page, "staff@manor.test");
  await expect(page).toHaveURL(`${BASE}/dashboard/schedule`);
  await expect(page.getByRole("heading", { name: en["nav.schedule"] })).toBeVisible();
});

test("deactivated user is signed out on next navigation", async ({ page }) => {
  await signIn(page, "accounts@manor.test");
  await expect(page).toHaveURL(`${BASE}/dashboard`);
  const where = "user_id = (select id from auth.users where email = 'accounts@manor.test')";
  await db.query(`update memberships set is_active = false, deactivated_at = now() where ${where}`);
  try {
    await page.goto(`${BASE}/dashboard/payments`);
    await expect(page).toHaveURL(`${BASE}/login`);
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(`${BASE}/login`); // the session is gone, not just hidden
  } finally {
    await db.query(`update memberships set is_active = true, deactivated_at = null where ${where}`);
  }
});

test("paused venue shows the paused notice", async ({ page }) => {
  const { rows } = await db.query("select status from tenants where slug = 'demo-hall'");
  await db.query("update tenants set status = 'paused' where slug = 'demo-hall'");
  try {
    await signIn(page, "owner@demo-hall.test");
    await expect(page.getByText(en.venuePaused)).toBeVisible();
  } finally {
    await db.query("update tenants set status = $1 where slug = 'demo-hall'", [rows[0].status]);
  }
});

test("super admin must pass the MFA challenge before /admin", async ({ page }) => {
  await signIn(page, "super@demo.test");
  await expect(page).toHaveURL(`${BASE}/mfa`);
  await page.goto(`${BASE}/admin`);
  await expect(page).toHaveURL(`${BASE}/mfa`); // no way around the challenge
  await shoot(page, "mfa-challenge");

  const secret = readFileSync(".seed/totp-secret", "utf8").trim();
  await page.getByLabel(en["mfa.code"]).fill(await generate({ secret }));
  await page.getByRole("button", { name: en["mfa.verify"] }).click();
  await expect(page).toHaveURL(`${BASE}/admin`);
});
