import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, signIn, TENANT_BASE } from "./helpers";

// The customer's payment panel on /b/<token>. Needs PAYMENTS_SANDBOX=1 (playwright.config.ts) and the seeded payments key.
// afterAll puts the venue's money rules back and removes every row made here.
test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const db = openDb();
const PHONES = { manual: "03005552001", focus: "03005552002", fail: "03005552003" };
const OURS = Object.values(PHONES).map((p) => `+92${p.slice(1)}`);
const karachiDate = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + days * 86_400_000));
// Clear of the other specs (30, 45 and the sample bookings at 90 to 100 days).
const DATES = { manual: karachiDate(60), focus: karachiDate(70), fail: karachiDate(75) };
let tenant = "";
let original: unknown;
let goldPackage = "";
let link = "";
let sandboxUrl = "";

async function cleanUp() {
  const ours = "select b.id from bookings b join customers c on c.id = b.customer_id where b.tenant_id = $1 and c.phone_e164 = any($2)";
  await db.query(`delete from access_tokens where target_id in (${ours})`, [tenant, OURS]);
  await db.query(`delete from bookings where id in (${ours})`, [tenant, OURS]);
  await db.query("delete from customers where tenant_id = $1 and phone_e164 = any($2)", [tenant, OURS]);
  await db.query("delete from booking_request_hits where tenant_id = $1", [tenant]);
}

const rulesWith = (patch: object) =>
  db.query("update tenant_settings set money_rules = $2::jsonb where tenant_id = $1", [tenant, JSON.stringify({ ...(original as object), ...patch })]);

/** A page with JavaScript off: the receipt form must work as a plain form post. */
async function noJsPage(browser: Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  return context.newPage();
}

const jpeg = () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#888888" } }).jpeg().toBuffer();

/** Sends the public form for the Gold package (it carries the prefilled choices); returns the private link. */
async function book(page: Page, phone: string, date: string) {
  await page.goto(`${TENANT_BASE}/book?event=barat&package=${goldPackage}&guests=300&date=${date}&slot=Dinner`);
  await page.getByLabel(en["booking.name"]).fill("Pay Khan");
  await page.getByLabel(en["booking.phone"]).fill(phone);
  await page.getByRole("button", { name: en["booking.submit"] }).click();
}

test.beforeAll(async () => {
  assertPassword();
  tenant = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  original = (await db.query("select money_rules from tenant_settings where tenant_id = $1", [tenant])).rows[0].money_rules;
  goldPackage = (
    await db.query("select p.id from packages p join event_types e on e.id = p.event_type_id where p.tenant_id = $1 and e.slug = 'barat' and p.name = 'Gold'", [tenant])
  ).rows[0].id;
  await cleanUp();
  await rulesWith({
    instantBooking: false,
    paymentMethods: ["bank", "jazzcash", "easypaisa", "gateway"],
    paymentAccounts: { bank: { bankName: "Meezan Bank", accountTitle: "Manor Marquee", accountNumber: "PK00MEZN0000001234" } },
  });
});

test.afterAll(async () => {
  await cleanUp();
  await db.query("update tenant_settings set money_rules = $2::jsonb where tenant_id = $1", [tenant, JSON.stringify(original)]);
  await db.end();
});

test.beforeEach(() => db.query("delete from booking_request_hits where tenant_id = $1", [tenant]).then(() => undefined));

test("a confirmed booking shows the advance and bank details, and a receipt sent without JavaScript reads Checking", async ({ page, browser }) => {
  await book(page, PHONES.manual, DATES.manual);
  await expect(page.getByRole("heading", { name: en["booking.sent.heading"] })).toBeVisible();
  link = (await page.getByRole("link", { name: en["booking.sent.open"] }).getAttribute("href"))!;
  const reference = (await page.getByTestId("reference").textContent())!.trim();

  await signIn(page, "manager1@manor.test");
  await page.getByRole("link", { name: en["nav.bookings"], exact: true }).click();
  await page.getByRole("link", { name: en["bookings.status.requested"], exact: true }).click();
  await page.getByRole("link", { name: reference }).click();
  await page.getByRole("form", { name: en["bookings.confirm.heading"] }).getByRole("button", { name: en["bookings.confirm.submit"] }).click();
  await expect(page.getByText(en["bookings.status.confirmed"], { exact: true }).first()).toBeVisible();

  const customer = await noJsPage(browser);
  await customer.goto(`${TENANT_BASE}${link}`);
  const panel = customer.getByRole("region", { name: en["pay.heading"] });
  await expect(panel).toContainText("Meezan Bank");
  await expect(panel).toContainText("PK00MEZN0000001234");
  // The seeded venue has no JazzCash details, so no JazzCash account is shown.
  await expect(panel.getByRole("term").filter({ hasText: en["pay.method.jazzcash"] })).toHaveCount(0);

  await customer.getByLabel(en["pay.upload.file"]).setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: await jpeg() });
  await customer.getByRole("button", { name: en["pay.upload.submit"] }).click();
  await expect(customer).toHaveURL(/\?sent=1$/);
  await expect(customer.getByText(en["pay.sent"])).toBeVisible();
  await expect(customer.getByText(en["pay.row.checking"], { exact: true })).toBeVisible();

  const rows = (await db.query("select status, method, receipt_path, source from payments where tenant_id = $1 and booking_id = (select b.id from bookings b where b.reference = $2)", [tenant, reference])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "pending", method: "bank", source: "customer_receipt" });
  const stored = await db.query("select 1 from storage.objects where bucket_id = 'payment-receipts' and name = $1", [rows[0].receipt_path]);
  expect(stored.rowCount).toBe(1);
  await customer.context().close();
});

test("a 5 MB file is refused and nothing is saved", async ({ browser }) => {
  const customer = await noJsPage(browser);
  await customer.goto(`${TENANT_BASE}${link}`);
  await customer.getByLabel(en["pay.upload.file"]).setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(5 * 1024 * 1024, 1) });
  await customer.getByRole("button", { name: en["pay.upload.submit"] }).click();
  await expect(customer).toHaveURL(/\?err=tooLarge$/);
  await expect(customer.getByRole("alert")).toHaveText(en["pay.err.tooLarge"]);
  expect((await db.query("select count(*)::int n from payments where tenant_id = $1 and source = 'customer_receipt'", [tenant])).rows[0].n).toBe(1);
  await customer.context().close();
});

test("quick booking lands on the held page, and opening ?paid=1 without paying still reads Checking", async ({ page }) => {
  await rulesWith({
    instantBooking: true,
    paymentMethods: ["bank", "gateway"],
    paymentAccounts: { bank: { bankName: "Meezan Bank", accountTitle: "Manor Marquee", accountNumber: "PK00MEZN0000001234" } },
  });
  await book(page, PHONES.focus, DATES.focus);
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(/^Held until /)).toBeVisible();
  link = new URL(page.url()).pathname;

  await page.getByRole("button", { name: en["pay.online"] }).click();
  await expect(page).toHaveURL(/\/pay\/sandbox\/[^/?]+$/);
  sandboxUrl = page.url();

  // Review Focus 3: the return redirect proves nothing. Only a pending online row says Checking.
  await page.goto(`${TENANT_BASE}${link}?paid=1`);
  await expect(page.getByText(en["pay.checking"], { exact: true })).toBeVisible();
  await expect(page.getByText(en["booking.status.awaiting_advance"])).toBeVisible();
  const state = await db.query(
    "select b.status, count(p.*) filter (where p.status = 'verified')::int verified from bookings b left join payments p on p.booking_id = b.id join customers c on c.id = b.customer_id where c.phone_e164 = $1 group by b.status",
    [`+92${PHONES.focus.slice(1)}`],
  );
  expect(state.rows).toEqual([{ status: "awaiting_advance", verified: 0 }]);
});

test("paying on the sandbox page confirms the booking and shows Received", async ({ page }) => {
  await page.goto(sandboxUrl);
  await page.getByRole("button", { name: en["pay.sandbox.pay"], exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(en["pay.sandbox.done"]);
  await page.goto(`${TENANT_BASE}${link}`);
  await expect(page.getByText(en["booking.status.confirmed"], { exact: true })).toBeVisible();
  await expect(page.getByText(en["pay.row.verified"], { exact: true })).toBeVisible();
  await expect(page.getByText(en["pay.checking"], { exact: true })).toHaveCount(0);
});

test("failing the sandbox payment leaves the booking held and reads Not accepted", async ({ page }) => {
  await book(page, PHONES.fail, DATES.fail);
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{43}$/);
  const failLink = new URL(page.url()).pathname;
  await page.getByRole("button", { name: en["pay.online"] }).click();
  await page.getByRole("button", { name: en["pay.sandbox.fail"] }).click();
  await expect(page.getByRole("status")).toHaveText(en["pay.sandbox.done"]);
  await page.goto(`${TENANT_BASE}${failLink}`);
  await expect(page.getByText(en["pay.row.rejected"], { exact: true })).toBeVisible();
  await expect(page.getByText(en["booking.status.awaiting_advance"])).toBeVisible();
  const status = await db.query("select b.status from bookings b join customers c on c.id = b.customer_id where c.phone_e164 = $1", [`+92${PHONES.fail.slice(1)}`]);
  expect(status.rows).toEqual([{ status: "awaiting_advance" }]);
});
