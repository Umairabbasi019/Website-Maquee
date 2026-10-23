import { expect, test, type Page } from "@playwright/test";
import { manorContent } from "../../scripts/seed-data/manor";
import { TENANT_BASE } from "./helpers";

const VENUES = [TENANT_BASE, "http://demo.localhost:3000"];

/** Steps through the whole page so every pinned section and lazy image has run. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
  });
}

for (const base of VENUES) {
  for (const width of [320, 375]) {
    test(`${base} at ${width}px has no horizontal page scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 667 });
      await page.goto(base);
      await scrollThrough(page);
      const [scrollWidth, viewWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollWidth).toBeLessThanOrEqual(viewWidth);
    });
  }

  test(`${base} logs no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await scrollThrough(page);
    expect(errors).toEqual([]);
  });
}

test("without WebGL the hero front shot and every caption show", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" || type === "webgl" ? null : getContext.call(this, type as "2d", ...(rest as []));
    } as typeof getContext;
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TENANT_BASE);
  const front = page.locator("#hero img").first();
  await expect(front).toBeVisible();
  await expect.poll(() => front.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const { hero } = manorContent;
  const caps = [hero.captions.arrival, hero.captions.doors, hero.captions.hall];
  for (const [i, progress] of [0, 0.3, 0.7].entries()) {
    await page.evaluate((p) => {
      const el = document.getElementById("hero")!;
      scrollTo(0, el.offsetTop + (el.offsetHeight - innerHeight) * p);
    }, progress);
    const h = page.getByRole("heading", { name: caps[i].lines.join(" ").replaceAll("*", "") });
    // Revealed: every line has slid into place (toBeVisible ignores the clip and the transform).
    await expect
      .poll(() => h.evaluate((el) => [...el.querySelectorAll(".line > span")].every((s) => Math.abs(new DOMMatrix(getComputedStyle(s).transform).f) < 1)), { timeout: 15_000 })
      .toBe(true);
  }
});

// The menu link and the "Check a date" pill share #contact; last() is the pill, visible before and after hydration.
// Off-screen sections skip layout until near the viewport (content-visibility: auto). A jump from the top must still land on the section.
test("nav links land on their section at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  for (const id of ["contact", "packages"]) {
    await page.goto(TENANT_BASE);
    if (id !== "contact") await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator(`nav a[href="#${id}"]`).last().evaluate((a: HTMLElement) => a.click()); // DOM click: the full-screen menu is fixed and Playwright's scroll-into-view fights it
    await expect.poll(() => page.evaluate((i) => Math.abs(document.getElementById(i)!.getBoundingClientRect().top), id), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  }
});
