import { expect, test } from "@playwright/test";
import { TENANT_BASE } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const todayInKarachi = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

test("the enquiry form builds the WhatsApp message and the call link", async ({ page }) => {
  await page.goto(TENANT_BASE);
  const contact = page.locator("#contact");
  const date = contact.getByLabel("Date", { exact: true });
  // The date min is filled in after hydration (server HTML has none, so no mismatch).
  await expect(date).toHaveAttribute("min", todayInKarachi(), { timeout: 30_000 });

  await date.fill("2020-01-01");
  expect(await date.evaluate((el: HTMLInputElement) => el.matches(":invalid"))).toBe(true);

  await date.fill("2027-03-14");
  await contact.getByText("Mehndi", { exact: true }).click();
  await contact.getByText("Lunch", { exact: true }).click();
  await contact.getByLabel("Number of guests").fill("250");
  await contact.getByLabel("Your name").fill("  Ayesha ");

  const send = contact.getByRole("link", { name: "WhatsApp this to Ahmed" });
  await expect(send).toHaveAttribute("target", "_blank");
  const expected = [
    "Assalam o Alaikum, I'd like to check availability.",
    "Date: Sun, 14 Mar 2027",
    "Event: Mehndi (Lunch)",
    "Guests: about 250",
    "Name: Ayesha",
  ].join("\n");
  await expect(send).toHaveAttribute("href", `https://wa.me/923085021418?text=${encodeURIComponent(expected)}`);
  await expect(contact.locator("[aria-live=polite]")).toContainText("Name: Ayesha");

  // A name of only spaces is left out of the message.
  await contact.getByLabel("Your name").fill("   ");
  await expect(send).not.toHaveAttribute("href", /Name/);

  const call = contact.getByRole("link", { name: "Call 0308 502 1418" });
  await expect(call).toHaveAttribute("href", "tel:+923085021418");
});

test("the map loads only near the map card and directions are always there", async ({ page }) => {
  await page.goto(TENANT_BASE);
  const iframe = page.locator("#contact iframe");
  await expect(iframe).toHaveCount(0);
  await expect(page.locator("#contact").getByRole("link", { name: "Get directions" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=33.6476537,73.1076748",
  );
  await page.locator("#contact").getByRole("heading", { name: "Find us" }).scrollIntoViewIfNeeded();
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute("src", "https://maps.google.com/maps?q=33.6476537,73.1076748&z=14&output=embed");
  await expect(iframe).toHaveAttribute("loading", "lazy");
});

test("live hours replace the checking text after load", async ({ page }) => {
  await page.goto(TENANT_BASE);
  await expect(page.locator("#contact").getByText(/^(Open now|Closed now)/)).toBeVisible({ timeout: 30_000 });
});

test("Check a Mehndi date selects the Mehndi chip", async ({ page }) => {
  const chip = page.locator("#contact").getByRole("radio", { name: "Mehndi" });
  // Retried: a click before hydration on a cold dev server only follows the link.
  await expect(async () => {
    await page.goto(TENANT_BASE);
    await page.locator("#events").getByRole("link", { name: "Check a Mehndi date" }).first().dispatchEvent("click");
    await expect(chip).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
});

test("without JavaScript the call link, address and directions work", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(TENANT_BASE);
  const contact = page.locator("#contact");
  await expect(contact.getByRole("link", { name: "Call 0308 502 1418" })).toBeVisible();
  await expect(contact.getByText("Marquee Complex, Islamabad Expressway", { exact: true })).toBeVisible();
  await expect(contact.getByRole("link", { name: "Get directions" })).toBeVisible();
  await context.close();
});
