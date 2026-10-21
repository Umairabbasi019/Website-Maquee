import { expect, test } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { manorContent } from "../../scripts/seed-data/manor";
import { TENANT_BASE } from "./helpers";

const DEMO_BASE = "http://demo.localhost:3000";

test("a live venue shows its content title and no preview bar", async ({ page }) => {
  await page.goto(TENANT_BASE);
  await expect(page).toHaveTitle(manorContent.seo.title);
  await expect(page.getByText(en["site.previewBar"])).toHaveCount(0);
  await expect(page.locator("footer#footer")).toBeVisible();
  // overflow-x: hidden here would turn the wrapper into a scroll container and stop pinned sections from sticking.
  const overflowY = await page.locator(".site-root").evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflowY).toBe("visible");
});

test("a venue in setup shows the preview bar and is not indexed", async ({ page }) => {
  await page.goto(DEMO_BASE);
  await expect(page.getByText(en["site.previewBar"])).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("an unknown venue host shows the not-found page", async ({ page }) => {
  // htmlLimitedBots renders the full document before sending, so notFound() sets a real 404.
  const res = await page.goto("http://nobody.localhost:3000");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.locator("footer#footer")).toHaveCount(0);
});
