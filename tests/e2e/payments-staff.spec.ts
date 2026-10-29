import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { formatRs, rupeesInput } from "../../src/sections/shared/format";
import { en } from "../../src/ui/i18n/en";
import { assertPassword, openDb, signIn as logIn, TENANT_BASE } from "./helpers";

// The staff side of the money: ledger, alerts, cancel with a refund, and the mode switch. Needs PAYMENTS_SANDBOX=1
// (playwright.config.ts) and the seeded payments key. afterAll puts the venue's money rules back and removes every row made here.
test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const db = openDb();
const PHONES = { paid: "03005553001", rejected: "03005553002", overdue: "03005553003", hold: "03005553004" };
const OURS = Object.values(PHONES).map((p) => `+92${p.slice(1)}`);
const karachiDate = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + days * 86_400_000));
// Clear of the other specs (30, 45, 60, 70, 75 and the sample bookings at 90 to 100 days).
const DATES = { paid: karachiDate(50), rejected: karachiDate(55), overdue: karachiDate(65), hold: karachiDate(80) };
const BANK = { bank: { bankName: "Meezan Bank", accountTitle: "Manor Marquee", accountNumber: "PK00MEZN0000001234" } };
const ARRIVED = 100_000; // Rs 1,000: less than the advance, to prove the amount staff type is the one that counts
const ids = {} as Record<keyof typeof PHONES, string>;
const links = {} as Record<keyof typeof PHONES, string>;
const refs = {} as Record<keyof typeof PHONES, string>;
let tenant = "";
let original: unknown;
let goldPackage = "";

async function cleanUp() {
  const ours = "select b.id from bookings b join customers c on c.id = b.customer_id where b.tenant_id = $1 and c.phone_e164 = any($2)";
  await db.query(`delete from access_tokens where target_id in (${ours})`, [tenant, OURS]);
  await db.query(`delete from bookings where id in (${ours})`, [tenant, OURS]);
  await db.query("delete from customers where tenant_id = $1 and phone_e164 = any($2)", [tenant, OURS]);
  await db.query("delete from booking_request_hits where tenant_id = $1", [tenant]);
}

const rulesWith = (patch: object) =>
  db.query("update tenant_settings set money_rules = $2::jsonb where tenant_id = $1", [tenant, JSON.stringify({ ...(original as object), ...patch })]);

/** How many bookings a payment alert lists now, from the same SQL the dashboard uses. */
const alertCount = async (key: string) =>
  (await db.query("select jsonb_array_length(public.payment_alerts($1) -> $2) n", [tenant, key])).rows[0].n as number;

const money = async (reference: string) =>
  (await db.query("select q.total_paisa, q.advance_paisa from quotes q join bookings b on b.current_quote_id = q.id where b.reference = $1", [reference])).rows[0] as {
    total_paisa: number;
    advance_paisa: number;
  };

const jpeg = () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#888888" } }).jpeg().toBuffer();

/** Sends the public form for the Gold package; returns the private link and the reference. */
async function book(page: Page, phone: string, date: string) {
  await page.goto(`${TENANT_BASE}/book?event=barat&package=${goldPackage}&guests=300&date=${date}&slot=Dinner`);
  await page.getByLabel(en["booking.name"]).fill("Ledger Khan");
  await page.getByLabel(en["booking.phone"]).fill(phone);
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{43}$/);
  return new URL(page.url()).pathname;
}

async function sendRequest(browser: Browser, phone: string, date: string) {
  const page = await browser.newPage();
  await page.goto(`${TENANT_BASE}/book?event=barat&package=${goldPackage}&guests=300&date=${date}&slot=Dinner`);
  await page.getByLabel(en["booking.name"]).fill("Ledger Khan");
  await page.getByLabel(en["booking.phone"]).fill(phone);
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  const link = (await page.getByRole("link", { name: en["booking.sent.open"] }).getAttribute("href"))!;
  const reference = (await page.getByTestId("reference").textContent())!.trim();
  await page.close();
  return { link, reference };
}

async function confirmRequest(page: Page, reference: string) {
  await page.goto(`${TENANT_BASE}/dashboard/bookings?status=requested`);
  await page.getByRole("link", { name: reference }).click();
  await page.getByRole("form", { name: en["bookings.confirm.heading"] }).getByRole("button", { name: en["bookings.confirm.submit"] }).click();
  await expect(page.getByText(en["bookings.status.confirmed"], { exact: true }).first()).toBeVisible();
  return page.url();
}

async function sendReceipt(browser: Browser, link: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${TENANT_BASE}${link}`);
  await page.getByLabel(en["pay.upload.file"]).setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: await jpeg() });
  await page.getByRole("button", { name: en["pay.upload.submit"] }).click();
  await expect(page.getByText(en["pay.row.checking"], { exact: true })).toBeVisible();
  await context.close();
}

async function signIn(page: Page, email: string) {
  await logIn(page, email);
  await expect(page).toHaveURL(`${TENANT_BASE}/dashboard`);
}

const ledger = (page: Page) => page.getByRole("region", { name: en["pay.ledger.heading"] });
/** The figure beside a label in the ledger's sums. */
const figure = (page: Page, label: string) => ledger(page).getByRole("term").filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
const bookingUrl = (key: keyof typeof PHONES) => `${TENANT_BASE}/dashboard/bookings/${ids[key]}`;

test.beforeAll(async () => {
  assertPassword();
  tenant = (await db.query("select id from tenants where slug = 'manor'")).rows[0].id;
  original = (await db.query("select money_rules from tenant_settings where tenant_id = $1", [tenant])).rows[0].money_rules;
  goldPackage = (
    await db.query("select p.id from packages p join event_types e on e.id = p.event_type_id where p.tenant_id = $1 and e.slug = 'barat' and p.name = 'Gold'", [tenant])
  ).rows[0].id;
  await cleanUp();
  await rulesWith({ instantBooking: false, paymentMethods: ["bank"], paymentAccounts: BANK, advanceDueDays: 5 });
});

test.afterAll(async () => {
  await cleanUp();
  await db.query("update tenant_settings set money_rules = $2::jsonb where tenant_id = $1", [tenant, JSON.stringify(original)]);
  await db.end();
});

test.beforeEach(() => db.query("delete from booking_request_hits where tenant_id = $1", [tenant]).then(() => undefined));

test("three confirmed bookings are ready", async ({ browser, page }) => {
  test.setTimeout(120_000);
  for (const key of ["paid", "rejected", "overdue"] as const) {
    const sent = await sendRequest(browser, PHONES[key], DATES[key]);
    links[key] = sent.link;
    refs[key] = sent.reference;
  }
  await signIn(page, "manager1@manor.test");
  for (const key of ["paid", "rejected", "overdue"] as const) ids[key] = (await confirmRequest(page, refs[key])).split("/").pop()!;
  // A confirmed booking with nothing paid reads "Advance due" until its date passes.
  await page.goto(bookingUrl("paid"));
  await expect(ledger(page).getByText(en["pay.state.advanceDue"], { exact: true })).toBeVisible();
  await expect(ledger(page).getByText(en["pay.ledger.none"])).toBeVisible();
});

test("a receipt alert opens the booking, the receipt opens in a new tab, and verifying at a changed amount updates the ledger and the audit log", async ({ browser, page }) => {
  await sendReceipt(browser, links.paid);
  const waiting = await alertCount("receiptsToReview");
  await signIn(page, "manager1@manor.test");
  const alert = page.getByRole("link", { name: en["pay.alert.receiptsToReview"].replace("{count}", String(waiting)) });
  await expect(alert).toBeVisible();
  if (waiting === 1) {
    await alert.click();
    await expect(page).toHaveURL(bookingUrl("paid"));
  } else {
    await page.goto(bookingUrl("paid"));
  }

  const { total_paisa: total, advance_paisa: advance } = await money(refs.paid);
  const panel = ledger(page);
  await expect(panel.getByText(en["pay.row.checking"], { exact: true })).toBeVisible();
  const [receipt] = await Promise.all([page.waitForEvent("popup"), panel.getByRole("link", { name: en["pay.ledger.view"] }).click()]);
  await receipt.waitForLoadState();
  expect(receipt.url()).toMatch(/\/payment-receipts\/.+token=/);
  await receipt.close();

  // The claimed amount is prefilled; staff type what actually arrived.
  const verify = panel.getByRole("form", { name: new RegExp(`^${en["pay.ledger.verify"]}`) });
  await expect(verify.getByLabel(en["pay.ledger.verifyAmount"])).toHaveValue(rupeesInput(advance));
  await verify.getByLabel(en["pay.ledger.verifyAmount"]).fill("1000");
  await verify.getByRole("button", { name: en["pay.ledger.verify"] }).click();
  await expect(panel.getByText(en["pay.row.verified"], { exact: true })).toBeVisible();
  await expect(figure(page, en["pay.ledger.paid"])).toHaveText(formatRs(ARRIVED));
  await expect(figure(page, en["pay.ledger.balance"])).toHaveText(formatRs(total - ARRIVED));
  await expect(panel.getByText(en["pay.state.advanceDue"], { exact: true })).toBeVisible();

  const audit = (await db.query("select before, after from audit_events where tenant_id = $1 and action = 'payment.verify' and entity_id = (select id from payments where booking_id = $2)", [tenant, ids.paid])).rows;
  expect(audit).toHaveLength(1);
  expect(audit[0].before).toMatchObject({ status: "pending", amountPaisa: advance });
  expect(audit[0].after).toMatchObject({ status: "verified", amountPaisa: ARRIVED });
});

test("a rejection with a reason works without JavaScript, the customer link shows the reason, and a new receipt is accepted", async ({ browser }) => {
  await sendReceipt(browser, links.rejected);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signIn(page, "manager1@manor.test");
  await page.goto(bookingUrl("rejected"));
  const panel = ledger(page);
  await panel.getByLabel(en["pay.ledger.rejectReason"]).fill("Photo is blurry");
  await panel.getByRole("button", { name: en["pay.ledger.reject"] }).click();
  await expect(page).toHaveURL(bookingUrl("rejected"));
  await expect(panel.getByText(en["pay.row.rejected"], { exact: true })).toBeVisible();
  await context.close();

  const customer = await browser.newContext();
  const view = await customer.newPage();
  await view.goto(`${TENANT_BASE}${links.rejected}`);
  await expect(view.getByText("Photo is blurry")).toBeVisible();
  await customer.close();

  await sendReceipt(browser, links.rejected);
  const rows = (await db.query("select status from payments where booking_id = $1 order by created_at", [ids.rejected])).rows.map((r) => r.status);
  expect(rows).toEqual(["rejected", "pending"]);
});

test("an accounts user verifies a receipt but sees no mode switch, no cancel form and no settings", async ({ page }) => {
  await signIn(page, "accounts@manor.test");
  await expect(page.getByRole("link", { name: en["nav.settings"], exact: true })).toHaveCount(0);
  await page.goto(`${TENANT_BASE}/dashboard/settings`);
  await expect(page.getByRole("heading", { name: en["forbidden.heading"] })).toBeVisible();
  await expect(page.getByLabel(en["settings.money.instant"])).toHaveCount(0);

  await page.goto(bookingUrl("rejected"));
  await expect(page.getByRole("form", { name: en["bookings.cancel.heading"] })).toHaveCount(0);
  const panel = ledger(page);
  await panel.getByRole("button", { name: en["pay.ledger.verify"], exact: true }).click();
  await expect(panel.getByText(en["pay.row.verified"], { exact: true })).toBeVisible();
  const verifier = (await db.query("select u.email from payments p join auth.users u on u.id = p.verified_by where p.booking_id = $1 and p.status = 'verified'", [ids.rejected])).rows;
  expect(verifier).toEqual([{ email: "accounts@manor.test" }]);
});

test("cancelling a paid booking asks what happens to the money, Refund due raises the alert, and recording the refund clears it", async ({ page }) => {
  await signIn(page, "manager1@manor.test");
  await page.goto(bookingUrl("paid"));
  const cancel = page.getByRole("form", { name: en["bookings.cancel.heading"] });
  await expect(cancel.getByText(en["bookings.cancel.money"].replace("{amount}", formatRs(ARRIVED)))).toBeVisible();
  await cancel.getByLabel(en["bookings.cancel.reason"]).fill("Customer withdrew");
  await cancel.getByLabel(en["bookings.cancel.refundDue"]).check();
  await cancel.getByRole("button", { name: en["bookings.cancel.submit"] }).click();
  await expect(page.getByText(en["bookings.status.cancelled"], { exact: true }).first()).toBeVisible();

  const owed = await alertCount("refundDue");
  expect(owed).toBeGreaterThanOrEqual(1);
  await page.goto(`${TENANT_BASE}/dashboard`);
  await expect(page.getByRole("link", { name: en["pay.alert.refundDue"].replace("{count}", String(owed)) })).toBeVisible();

  await page.goto(bookingUrl("paid"));
  const record = ledger(page).getByRole("form", { name: en["pay.ledger.record"] });
  await record.getByLabel(en["pay.ledger.amount"]).fill("1000");
  await record.getByRole("button", { name: en["pay.ledger.recordRefund"] }).click();
  await expect(figure(page, en["pay.ledger.paid"])).toHaveText(formatRs(0));
  expect(await alertCount("refundDue")).toBe(owed - 1);
  await page.goto(`${TENANT_BASE}/dashboard`);
  if (owed === 1) await expect(page.getByRole("link", { name: /^Refund due/ })).toHaveCount(0);
});

test("an advance due date in the past shows Advance overdue until Pays later is set", async ({ page }) => {
  await db.query("update bookings set advance_due_on = $2 where id = $1", [ids.overdue, karachiDate(-1)]);
  await signIn(page, "manager1@manor.test");
  const overdue = await alertCount("advanceOverdue");
  expect(overdue).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("link", { name: en["pay.alert.advanceOverdue"].replace("{count}", String(overdue)) })).toBeVisible();

  await page.goto(bookingUrl("overdue"));
  const panel = ledger(page);
  await expect(panel.getByText(en["pay.state.advanceOverdue"], { exact: true })).toBeVisible();
  const terms = panel.getByRole("form", { name: en["pay.ledger.terms"] });
  await terms.getByLabel(en["pay.ledger.payLater"]).check();
  await terms.getByRole("button", { name: en["pay.ledger.saveTerms"] }).click();
  await expect(panel.getByText(en["pay.state.paysLater"], { exact: true })).toBeVisible();
  expect(await alertCount("advanceOverdue")).toBe(overdue - 1);
});

test("a hold past its time reads Hold expired in the list, the filters and the detail", async ({ page }) => {
  await rulesWith({ instantBooking: true, paymentMethods: ["bank", "gateway"], paymentAccounts: BANK });
  await book(page, PHONES.hold, DATES.hold);
  await expect(page.getByText(/^Held until /)).toBeVisible();
  const row = (await db.query("select id, reference from bookings b where b.customer_id = (select id from customers where phone_e164 = $1 and tenant_id = $2)", [OURS[3], tenant])).rows[0];
  ids.hold = row.id;
  expect((await db.query("select status from bookings where id = $1", [row.id])).rows[0].status).toBe("awaiting_advance");
  // The booking guard locks hold_expires_at, so this session skips triggers to move it back (as tests/db/booking-request.test.ts does).
  const c = await db.connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query("update bookings set hold_expires_at = now() - interval '1 hour' where id = $1", [row.id]);
  } finally {
    await c.query("reset session_replication_role");
    c.release();
  }

  await signIn(page, "manager1@manor.test");
  await page.goto(`${TENANT_BASE}/dashboard/bookings`);
  await expect(page.getByRole("row").filter({ hasText: row.reference })).toContainText(en["bookings.status.hold_expired"]);
  await page.getByRole("link", { name: en["bookings.status.hold_expired"], exact: true }).click();
  await expect(page.getByRole("link", { name: row.reference })).toBeVisible();
  await page.getByRole("link", { name: en["bookings.status.awaiting_advance"], exact: true }).click();
  await expect(page.getByRole("link", { name: row.reference })).toHaveCount(0);

  await page.goto(bookingUrl("hold"));
  await expect(page.getByText(en["bookings.status.hold_expired"], { exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: en["bookings.cancel.heading"] })).toHaveCount(0);
});

test("a manager switches instant booking and the card gateway without resetting the other money rules", async ({ page }) => {
  await rulesWith({ instantBooking: false, paymentMethods: ["bank"], paymentAccounts: BANK, advanceDueDays: 5 });
  await signIn(page, "manager1@manor.test");
  await page.goto(`${TENANT_BASE}/dashboard/settings`);
  const form = page.getByRole("form", { name: en["settings.moneyRules"] });
  await form.getByLabel(en["settings.money.instant"]).check();
  await form.getByLabel(en["settings.money.method.gateway"]).check();
  await form.getByRole("button", { name: en["settings.save"] }).click();
  await expect(form.getByRole("status")).toHaveText(en["settings.saved"]);
  const saved = (await db.query("select money_rules from tenant_settings where tenant_id = $1", [tenant])).rows[0].money_rules;
  expect(saved).toMatchObject({ instantBooking: true, paymentMethods: ["bank", "gateway"], advanceDueDays: 5, paymentAccounts: BANK });
});
