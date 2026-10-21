import { expect, test, type BrowserContext } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, PLATFORM_BASE, signIn, shoot, passMfa, TENANT_BASE as BASE } from "./helpers";

const db = openDb();

test.beforeAll(assertPassword);
test.afterAll(() => db.end());

// The @supabase/ssr session cookie ("base64-" + base64url JSON), possibly split into .0, .1… chunks.
async function sessionCookie(context: BrowserContext) {
  const parts = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  parts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = parts.map((c) => c.value).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
  return { parts, session: session as { expires_at: number; refresh_token: string } };
}

/** Marks the access token expired in the browser's cookie, so the next request must refresh it. */
async function expireAccessToken(context: BrowserContext) {
  const { parts, session } = await sessionCookie(context);
  session.expires_at = Math.floor(Date.now() / 1000) - 60; // same digit count, so chunk lengths hold
  let rest = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await context.addCookies(
    parts.map((c) => {
      const value = c === parts.at(-1) ? rest : rest.slice(0, c.value.length);
      rest = rest.slice(value.length);
      return { ...c, value };
    }),
  );
  return session.refresh_token;
}

test("proxy refreshes an expired session and stores the rotated cookie", async ({ page, context }) => {
  await signIn(page, "manager2@manor.test");
  await expect(page).toHaveURL(`${BASE}/dashboard`);
  const oldRefresh = await expireAccessToken(context);

  await page.goto(`${BASE}/dashboard/bookings`);
  await expect(page.getByRole("heading", { name: en["nav.bookings"] })).toBeVisible();
  const { session } = await sessionCookie(context);
  // Without the proxy refresh the browser would keep the spent refresh token and lose the session.
  expect(session.refresh_token).not.toBe(oldRefresh);
  expect(session.expires_at).toBeGreaterThan(Date.now() / 1000);

  await page.goto(`${BASE}/dashboard/calendar`);
  await expect(page.getByRole("heading", { name: en["nav.calendar"] })).toBeVisible();
});

test("wrong password shows one generic error", async ({ page }) => {
  await signIn(page, "manager1@manor.test", BASE, "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: en["login.failed"] })).toBeVisible();
  await shoot(page, "login-error");
  await signIn(page, "nobody@manor.test", BASE, "not-the-password");
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
  await signIn(page, "super@demo.test", PLATFORM_BASE);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/mfa`);
  await page.goto(`${PLATFORM_BASE}/admin`);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/mfa`); // no way around the challenge
  await shoot(page, "mfa-challenge");

  await passMfa(page);
  await expect(page).toHaveURL(`${PLATFORM_BASE}/admin`);
});
