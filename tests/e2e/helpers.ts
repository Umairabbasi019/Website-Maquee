import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";
import pg from "pg";
import { en } from "../../src/ui/i18n/en";

// Needs the demo data: run `npm run db:seed` before `npm run test:e2e`.
export const TENANT_BASE = "http://manor.localhost:3000";
export const PLATFORM_BASE = "http://localhost:3000"; // PLATFORM_HOST in .env.local
const SHOTS = "e2e-shots"; // git-ignored
export const password = process.env.SEED_USER_PASSWORD ?? "";

export function assertPassword() {
  if (!password) throw new Error("SEED_USER_PASSWORD is not set (see .env.example)");
}

/** One pool per spec file: the file's afterAll ends it. */
export const openDb = () =>
  new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });

export async function signIn(page: Page, email: string, base = TENANT_BASE, pass = password) {
  await page.goto(`${base}/login`);
  await page.getByLabel(en["login.email"]).fill(email);
  await page.getByLabel(en["login.password"]).fill(pass);
  await page.getByRole("button", { name: en["login.submit"] }).click();
}

/** Answers the TOTP challenge with the seeded factor (.seed/totp-secret, written by `npm run db:seed`). */
export async function passMfa(page: Page) {
  const secret = readFileSync(".seed/totp-secret", "utf8").trim();
  await page.getByLabel(en["mfa.code"]).fill(await generate({ secret }));
  await page.getByRole("button", { name: en["mfa.verify"] }).click();
}

/** Super admin at aal2 on the platform host, landing on /admin. */
export async function signInSuperAdmin(page: Page) {
  await signIn(page, "super@demo.test", PLATFORM_BASE);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/mfa`);
  await passMfa(page);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/admin`);
}

export async function shoot(page: Page, name: string) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
}
