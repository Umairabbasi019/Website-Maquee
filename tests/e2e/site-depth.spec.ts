import { expect, test, type Page } from "@playwright/test";
import { noWebGL, TENANT_BASE } from "./helpers";

// Headless Chromium defaults to SwiftShader, which the depth layer treats as no WebGL2; --enable-gpu uses the machine's GPU.
// launchOptions forces its own worker, so these live in their own file.
test.use({ launchOptions: { args: ["--enable-gpu"] }, viewport: { width: 1440, height: 900 } });

/** Resolves after the browser has been idle once, plus a margin: by then the depth layer would have mounted. */
const afterIdle = (page: Page) => page.evaluate(() => new Promise((r) => requestIdleCallback(() => setTimeout(r, 1000))));

test("the Manor hero draws its depth layer without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(TENANT_BASE);
  // One canvas per hero photo; the hall one paints only once the cross fades it in.
  await expect(page.locator("#hero canvas")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator("#hero canvas[data-ready]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const [name, setup] of [
  ["without WebGL", (page: Page) => page.addInitScript(noWebGL)],
  ["with reduced motion", (page: Page) => page.emulateMedia({ reducedMotion: "reduce" })],
] as const) {
  test(`${name} the hero has no depth canvas and the front shot shows`, async ({ page }) => {
    await setup(page);
    await page.goto(TENANT_BASE);
    await afterIdle(page);
    await expect(page.locator("#hero canvas")).toHaveCount(0);
    await expect(page.locator("#hero img").first()).toBeVisible();
  });
}
