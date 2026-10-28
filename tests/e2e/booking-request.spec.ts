import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { openDb, TENANT_BASE } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const db = openDb();
const PHONE = "+923001234567";
const TAKEN_PHONE = "+923009999999";
const manor = () => db.query("select id from tenants where slug = 'manor'").then((r) => r.rows[0].id as string);
const karachiDate = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + days * 86_400_000));
const DATE = karachiDate(30);

// Each request counts toward the 5-per-hour limits; clear them so reruns within the hour still pass.
async function cleanUp() {
  const tenant = await manor();
  const ours = "select b.id from bookings b join customers c on c.id = b.customer_id where b.tenant_id = $1 and c.phone_e164 = any($2)";
  await db.query(`delete from access_tokens where target_id in (${ours})`, [tenant, [PHONE, TAKEN_PHONE]]);
  await db.query(`delete from bookings where id in (${ours})`, [tenant, [PHONE, TAKEN_PHONE]]);
  await db.query("delete from customers where tenant_id = $1 and phone_e164 = any($2)", [tenant, [PHONE, TAKEN_PHONE]]);
  await db.query("delete from booking_request_hits where tenant_id = $1", [tenant]);
}

test.beforeAll(cleanUp);
test.afterAll(async () => {
  await cleanUp();
  await db.end();
});

/** Fills and sends the form for DATE, Barat, Dinner, 300 guests; returns the sent page's reference. */
async function sendRequest(page: Page) {
  await page.goto(`${TENANT_BASE}/book`);
  await page.getByLabel(en["booking.date"]).fill(DATE);
  await page.getByRole("radio", { name: "Barat", exact: true }).check({ force: true });
  await page.getByRole("radio", { name: "Dinner", exact: true }).check({ force: true });
  await page.getByLabel(en["booking.guests"]).fill("300");
  await page.getByLabel(en["booking.name"]).fill("Ayesha Khan");
  await page.getByLabel(en["booking.phone"]).fill("0300 1234567");
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  await expect(page.getByRole("heading", { name: en["booking.sent.heading"] })).toBeVisible();
  return (await page.getByTestId("reference").textContent())!.trim();
}

const mainText = async (page: Page, reference: string) =>
  (await page.locator("main").innerText()).replaceAll(reference, "REF").replace(/\/b\/[\w-]{43}/g, "/b/TOKEN");

test("a request for a free date and one for a taken date look the same, and the link shows it", async ({ page }) => {
  const free = await sendRequest(page);
  expect(free).toMatch(/^MA-\d{4}-\d{4}$/);
  expect(new URL(page.url()).searchParams.get("ref")).toBeNull();
  const freeSent = await mainText(page, free);
  await page.getByRole("link", { name: en["booking.sent.open"] }).click();
  await expect(page).toHaveURL(/\/b\/[\w-]{43}$/);
  await expect(page.getByText(en["booking.status.requested"])).toBeVisible();
  await expect(page.getByText(free)).toBeVisible();
  const freeView = await mainText(page, free);

  // A confirmed booking in the same hall, date and slot (seed rows arrive later, so it is made here).
  const tenant = await manor();
  const customer = (
    await db.query("insert into customers (tenant_id, name, phone_e164) values ($1, 'Taken', $2) returning id", [tenant, TAKEN_PHONE])
  ).rows[0].id;
  const ids = (
    await db.query(
      `select (select id from slots where tenant_id = $1 and name = 'Dinner') slot,
              (select id from halls where tenant_id = $1 limit 1) hall,
              (select id from event_types where tenant_id = $1 and slug = 'barat') event`,
      [tenant],
    )
  ).rows[0];
  const booking = (
    await db.query(
      "insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, event_type_name, guests) values ($1, 'ZZ-0000-0001', $2, $3, $4, $5, 'Barat', 300) returning id",
      [tenant, customer, DATE, ids.slot, ids.event],
    )
  ).rows[0].id;
  const quote = (
    await db.query("insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 1, 1) returning id", [
      tenant,
      booking,
    ])
  ).rows[0].id;
  await db.query(
    "update bookings set status = 'confirmed', hall_id = $2, during = tstzrange(($3::date + time '19:00') at time zone 'Asia/Karachi', ($3::date + time '23:00') at time zone 'Asia/Karachi'), current_quote_id = $4 where id = $1",
    [booking, ids.hall, DATE, quote],
  );

  const taken = await sendRequest(page);
  expect(taken).not.toBe(free);
  expect(await mainText(page, taken)).toBe(freeSent);
  await page.getByRole("link", { name: en["booking.sent.open"] }).click();
  expect(await mainText(page, taken)).toBe(freeView);
});

test("the form works without JavaScript and keeps the input on an error", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${TENANT_BASE}/book?event=barat&slot=Dinner&guests=300&date=${DATE}`);
  await expect(page.getByRole("radio", { name: "Barat", exact: true })).toBeChecked();
  await page.getByLabel(en["booking.name"]).fill("Ayesha Khan");
  await page.getByLabel(en["booking.phone"]).fill("12345");
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  await expect(page.getByText(en["booking.error.phone"])).toBeVisible();
  await expect(page.getByLabel(en["booking.phone"])).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel(en["booking.name"])).toHaveValue("Ayesha Khan");
  await expect(page.getByLabel(en["booking.guests"])).toHaveValue("300");

  await page.getByLabel(en["booking.phone"]).fill("0300 1234567");
  await page.getByRole("button", { name: en["booking.submit"] }).click();
  await expect(page.getByRole("heading", { name: en["booking.sent.heading"] })).toBeVisible();
  await expect(page.getByTestId("reference")).toHaveText(/^MA-\d{4}-\d{4}$/);
  await context.close();
});

test("the estimate shows only when the venue turns it on", async ({ page }) => {
  const tenant = await manor();
  const gold = (
    await db.query("select p.id from packages p join event_types e on e.id = p.event_type_id where p.tenant_id = $1 and e.slug = 'barat' and p.name = 'Gold'", [tenant])
  ).rows[0].id;
  const url = `${TENANT_BASE}/book?event=barat&package=${gold}&guests=300&date=${DATE}`;
  await page.goto(url);
  const estimate = page.getByRole("status").filter({ hasText: en["booking.estimate"] });
  await expect(estimate).toContainText("Rs 1,260,000");
  await expect(estimate).toContainText(en["booking.estimateNote"]);
  await page.getByLabel(en["booking.package"]).selectOption("");
  await expect(estimate).toContainText(en["booking.priceOnCall"]);

  await db.query("update tenant_settings set money_rules = money_rules || '{\"showPriceEstimate\": false}' where tenant_id = $1", [tenant]);
  try {
    await page.goto(url);
    await expect(page.getByLabel(en["booking.package"])).toHaveValue(gold);
    await expect(page.getByText(en["booking.estimate"], { exact: true })).toHaveCount(0);
  } finally {
    await db.query("update tenant_settings set money_rules = money_rules - 'showPriceEstimate' where tenant_id = $1", [tenant]);
  }
});

test("prefill ignores choices that are not this venue's", async ({ page }) => {
  await page.goto(`${TENANT_BASE}/book?event=nope&slot=Brunch&guests=abc&package=00000000-0000-4000-8000-000000000000&date=bad`);
  await expect(page.getByLabel(en["booking.date"])).toHaveValue("");
  await expect(page.getByLabel(en["booking.package"])).toHaveValue("");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("the site links to the form with the visitor's choices", async ({ page }) => {
  await page.goto(TENANT_BASE);
  const contact = page.locator("#contact");
  await expect(contact.getByLabel("Date", { exact: true })).toHaveAttribute("min", /\d/, { timeout: 30_000 });
  await contact.getByLabel("Date", { exact: true }).fill("2027-03-14");
  await contact.getByText("Mehndi", { exact: true }).click();
  await contact.getByText("Lunch", { exact: true }).click();
  await expect(contact.getByRole("link", { name: en["booking.request"] })).toHaveAttribute(
    "href",
    "/book?date=2027-03-14&event=mehndi&slot=Lunch&guests=" + (await contact.locator("output").textContent()),
  );
  const pkg = page.locator("#packages").getByRole("link", { name: `${en["booking.request"]}: Gold` }).first();
  await expect(pkg).toHaveAttribute("href", /^\/book\?event=barat&package=[0-9a-f-]{36}$/);
});

test("private pages are noindex, send no referrer, and unknown or foreign links are 404", async ({ page }) => {
  expect((await page.goto(`${TENANT_BASE}/b/garbage`))?.status()).toBe(404);
  expect((await page.goto(`${TENANT_BASE}/book/sent?t=garbage`))?.status()).toBe(404);

  const reference = await sendRequest(page);
  expect(reference).toBeTruthy();
  for (const meta of [page.locator('meta[name="robots"]'), page.locator('meta[name="referrer"]')]) await expect(meta).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await page.getByRole("link", { name: en["booking.sent.open"] }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

  // The same link on another venue's host shows nothing.
  const path = new URL(page.url()).pathname;
  expect((await page.goto(`http://demo.localhost:3000${path}`))?.status()).toBe(404);
});
