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
});

test("a venue in setup shows the preview bar and is not indexed", async ({ page }) => {
  await page.goto(DEMO_BASE);
  await expect(page.getByText(en["site.previewBar"])).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

// The page streams inside Suspense (cacheComponents), so the HTTP status is already 200 when notFound() runs; the not-found page is what shows.
test("an unknown venue host shows the not-found page", async ({ page }) => {
  await page.goto("http://nobody.localhost:3000");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.locator("footer#footer")).toHaveCount(0);
});
