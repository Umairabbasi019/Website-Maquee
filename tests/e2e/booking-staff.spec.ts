import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, signIn, TENANT_BASE } from "./helpers";

// Requests go through the public form; staff then confirm, clash and decline them. afterAll removes every row made here.
test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const db = openDb();
const REQUESTS = {
  confirm: { name: "Confirm Khan", phone: "03005551001" },
  clash: { name: "Clash Khan", phone: "03005551002" },
  decline: { name: "Decline Khan", phone: "03005551003" },
};
const PAST_PHONE = "+923005551004";
const OURS = [...Object.values(REQUESTS).map((r) => `+92${r.phone.slice(1)}`), PAST_PHONE];
const ROLE = "E2E desk";
const karachiDate = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + days * 86_400_000));
// Clear of booking-request.spec (30 days) and the settings spec's date prices.
const DATE = karachiDate(45);
let tenant = "";
type Sent = { reference: string; link: string };
const sent = {} as Record<keyof typeof REQUESTS, Sent>;

async function cleanUp() {
  const ours = "select b.id from bookings b join customers c on c.id = b.customer_id where b.tenant_id = $1 and c.phone_e164 = any($2)";
  await db.query(`delete from access_tokens where target_id in (${ours})`, [tenant, OURS]);
  await db.query(`delete from bookings where id in (${ours})`, [tenant, OURS]);
  await db.query("delete from customers where tenant_id = $1 and phone_e164 = any($2)", [tenant, OURS]);
  await db.query("delete from booking_request_hits where tenant_id = $1", [tenant]);
  // A killed run can leave staff on the custom role; put it back first, or the role cannot be deleted.
  await db.query(
    `update memberships set role_id = (select id from roles where tenant_id is null and name = 'staff')
     where tenant_id = $1 and role_id in (select id from roles where tenant_id = $1 and name = $2)`,
    [tenant, ROLE],
  );
  await db.query("delete from roles where tenant_id = $1 and name = $2", [tenant, ROLE]);
}

async function sendRequest(browser: Browser, { name, phone }: { name: string; phone: string }) {
  const page = await browser.newPage();
  await page.goto(`${TENANT_BASE}/book`);
  await page.getByLabel(en["booking.date"]).fill(DATE);
  await page.getByRole("radio", { name: "Barat", exact: true }).check({ force: true });
  await page.getByRole("radio", { name: "Dinner", exact: true }).check({ force: true });
  await page.getByLabel(en["booking.guests"]).fill("300");
  await page.getByLabel(en["booking.name"]).fill(name);
  await page.getByLabel(en["booking.phone"]).fill(phone);
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  await expect(page.getByRole("heading", { name: en["booking.sent.heading"] })).toBeVisible();
  const reference = (await page.getByTestId("reference").textContent())!.trim();
  const link = (await page.getByRole("link", { name: en["booking.sent.open"] }).getAttribute("href"))!;
  await page.close();
  return { reference, link };
}

/** Opens a request from the Requested filter of the bookings list. */
async function openRequest(page: Page, reference: string) {
  await page.getByRole("link", { name: en["nav.bookings"], exact: true }).click();
  await page.getByRole("link", { name: en["bookings.status.requested"], exact: true }).click();
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard/bookings?status=requested`);
  await page.getByRole("link", { name: reference }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  assertPassword();
  tenant = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  await cleanUp();
  for (const key of Object.keys(REQUESTS) as (keyof typeof REQUESTS)[]) sent[key] = await sendRequest(browser, REQUESTS[key]);
});

test.afterAll(async () => {
  await cleanUp();
  await db.end();
});

test("the overview counts new requests and links to them", async ({ page }) => {
  const expected = (
    await db.query("select count(*)::int n from bookings where tenant_id = $1 and status = 'requested' and event_date >= $2", [tenant, karachiDate(0)])
  ).rows[0].n;
  expect(expected).toBeGreaterThanOrEqual(3);
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
  const count = page.getByRole("link", { name: en["bookings.overview.new"].replace("{count}", String(expected)) });
  await expect(count).toHaveAttribute("href", "/dashboard/bookings?status=requested");
});

test("a manager confirms with an override and the customer link shows the final total", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await openRequest(page, sent.confirm.reference);
  await expect(page.getByRole("definition").filter({ hasText: REQUESTS.confirm.name })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "0300 555 1001" })).toBeVisible();

  const form = page.getByRole("form", { name: en["bookings.confirm.heading"] });
  await expect(form.getByLabel(en["bookings.confirm.hall"])).toHaveValue(/[0-9a-f-]{36}/);
  await expect(form.getByRole("status")).toContainText(en["booking.view.total"]);
  // C2: the override starts empty, so leaving it means the calculated total.
  await expect(form.getByLabel(en["bookings.confirm.final"])).toHaveValue("");
  await form.getByLabel(en["bookings.confirm.final"]).fill("Rs 700,000");
  await form.getByLabel(en["bookings.confirm.reason"]).fill("Agreed on the phone");
  await form.getByRole("button", { name: en["bookings.confirm.submit"] }).click();

  await expect(page.getByText(en["bookings.status.confirmed"], { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("form", { name: en["bookings.confirm.heading"] })).toHaveCount(0);
  await expect(page.getByRole("region", { name: en["bookings.detail.quote"] }).getByText("Rs 700,000")).toBeVisible();
  // Staff see why the total differs from the calculated lines.
  await expect(page.getByText(/^Changed from Rs [\d,]+: Agreed on the phone$/)).toBeVisible();

  // Ruling 11: the customer sees only the final total and the advance, never the calculated lines or the reason.
  await page.goto(`${TENANT_BASE}${sent.confirm.link}`);
  await expect(page.getByText(en["booking.status.confirmed"], { exact: true })).toBeVisible();
  const price = page.getByRole("region", { name: en["booking.view.price"] });
  await expect(price.getByRole("listitem")).toHaveCount(2);
  await expect(price.getByRole("listitem").first()).toContainText("Rs 700,000");
  await expect(page.locator("main")).not.toContainText("Agreed on the phone");
});

test("a second request for the same hall, date and slot gets the slot-taken message", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await openRequest(page, sent.clash.reference);
  const form = page.getByRole("form", { name: en["bookings.confirm.heading"] });
  await form.getByRole("button", { name: en["bookings.confirm.submit"] }).click();
  await expect(form.getByRole("alert")).toHaveText(en["bookings.error.slotTaken"]);
  await expect(form.getByLabel(en["bookings.confirm.hall"])).toBeFocused();
  const row = await db.query("select status from bookings where tenant_id = $1 and reference = $2", [tenant, sent.clash.reference]);
  expect(row.rows[0].status).toBe("requested");
});

test("a role without quotes.override confirms without the override field", async ({ page }) => {
  const role = (await db.query("insert into roles (tenant_id, name) values ($1, $2) returning id", [tenant, ROLE])).rows[0].id;
  await db.query("insert into role_permissions (role_id, permission_key) values ($1, 'bookings.view'), ($1, 'bookings.edit')", [role]);
  const member = "tenant_id = $1 and user_id = (select id from auth.users where email = 'staff@manor.test')";
  await db.query(`update memberships set role_id = $2 where ${member}`, [tenant, role]);
  try {
    await signIn(page, "staff@manor.test");
    await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
    await openRequest(page, sent.clash.reference);
    const form = page.getByRole("form", { name: en["bookings.confirm.heading"] });
    await expect(form.getByRole("button", { name: en["bookings.confirm.submit"] })).toBeVisible();
    await expect(form.getByLabel(en["bookings.confirm.final"])).toHaveCount(0);
    await expect(form.getByLabel(en["bookings.confirm.reason"])).toHaveCount(0);
  } finally {
    await db.query(`update memberships set role_id = (select id from roles where tenant_id is null and name = 'staff') where ${member}`, [tenant]);
  }
});

test("a price change after a hall preview shows the new price, not the old one", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await openRequest(page, sent.decline.reference);
  const form = page.getByRole("form", { name: en["bookings.confirm.heading"] });
  const hall = form.getByLabel(en["bookings.confirm.hall"]);
  // Manor has one hall, so a change event on it stands in for picking another: the quote now follows the select.
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), hall.dispatchEvent("change")]);
  const previewed = form.locator('input[name="previewedTotalPaisa"]');
  await expect(previewed).toHaveValue(/^\d+$/);
  const before = Number(await previewed.inputValue());
  const halls = (await db.query("select id, hire_price_paisa from halls where tenant_id = $1", [tenant])).rows;
  await db.query("update halls set hire_price_paisa = coalesce(hire_price_paisa, 0) + 100000 where tenant_id = $1", [tenant]);
  try {
    await form.getByRole("button", { name: en["bookings.confirm.submit"] }).click();
    await expect(form.getByRole("alert")).toHaveText(en["bookings.error.priceChanged"]);
    // The answer's own preview replaces the hall preview, so a retry posts the price now on screen.
    await expect(previewed).toHaveValue(String(before + 100000));
  } finally {
    for (const h of halls) await db.query("update halls set hire_price_paisa = $2 where id = $1", [h.id, h.hire_price_paisa]);
  }
  const row = await db.query("select status from bookings where tenant_id = $1 and reference = $2", [tenant, sent.decline.reference]);
  expect(row.rows[0].status).toBe("requested");
});

test("declining works without JavaScript and the customer link shows the not-confirmed copy", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
  await openRequest(page, sent.decline.reference);
  // Without JavaScript the hall select cannot refresh the quote, so a button asks for it; it never confirms.
  const confirm = page.getByRole("form", { name: en["bookings.confirm.heading"] });
  await confirm.getByRole("button", { name: en["bookings.confirm.update"] }).click();
  await expect(page).toHaveURL(/\?hall=[0-9a-f-]{36}$/);
  await expect(confirm.getByText(en["bookings.confirm.preview"])).toBeVisible();
  await expect(confirm.getByRole("listitem").filter({ hasText: en["booking.view.total"] })).toContainText(/Rs [\d,]+/);
  const still = await db.query("select status from bookings where tenant_id = $1 and reference = $2", [tenant, sent.decline.reference]);
  expect(still.rows[0].status).toBe("requested");
  const form = page.getByRole("form", { name: en["bookings.decline.heading"] });
  await form.getByLabel(en["bookings.decline.reason"]).fill("Hall under repair");
  await form.getByRole("button", { name: en["bookings.decline.submit"] }).click();
  await expect(page.getByText(en["bookings.status.declined"], { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hall under repair")).toBeVisible(); // staff see the reason in the history

  await page.goto(`${TENANT_BASE}${sent.decline.link}`);
  await expect(page.getByText(en["booking.notConfirmed"])).toBeVisible();
  await expect(page.getByText("Hall under repair")).toHaveCount(0);
  await context.close();
});

test("the calendar month shows the confirmed entry, and reads as a list at 375 px", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
  await page.goto(`${TENANT_BASE}/dashboard/calendar?month=${DATE.slice(0, 7)}`);
  const day = page.locator("td", { has: page.locator(`time[datetime="${DATE}"]`) });
  const entry = day.getByRole("link", { name: new RegExp(REQUESTS.confirm.name) });
  await expect(entry).toContainText("Dinner");
  await expect(entry).toContainText(en["bookings.status.confirmed"]);
  await expect(day).toContainText(REQUESTS.clash.name); // a pending request shows too
  await expect(day).not.toContainText(REQUESTS.decline.name);
  await entry.click();
  await expect(page.getByRole("heading", { name: sent.confirm.reference })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goBack();
  await expect(entry).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("a past request is listed as expired, not as requested", async ({ page }) => {
  const customer = (
    await db.query("insert into customers (tenant_id, name, phone_e164) values ($1, 'Past Khan', $2) returning id", [tenant, PAST_PHONE])
  ).rows[0].id;
  await db.query(
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
     values ($1, 'ZZ-0000-0002', $2, $3, (select id from slots where tenant_id = $1 and name = 'Dinner'), 'Barat', 300)`,
    [tenant, customer, karachiDate(-3)],
  );
  await signIn(page, "manager1@manor.test");
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
  await page.goto(`${TENANT_BASE}/dashboard/bookings?status=requested`);
  await expect(page.getByRole("link", { name: sent.clash.reference })).toBeVisible();
  await expect(page.getByRole("link", { name: "ZZ-0000-0002" })).toHaveCount(0);
  await page.getByRole("link", { name: en["bookings.status.expired"], exact: true }).click();
  const row = page.getByRole("row", { name: /ZZ-0000-0002/ });
  await expect(row).toContainText(en["bookings.status.expired"]);
  await expect(page.getByRole("link", { name: sent.clash.reference })).toHaveCount(0);
});
