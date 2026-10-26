import { expect, test, type Page } from "@playwright/test";
import { manorContent } from "../../scripts/seed-data/manor";
import { noWebGL, TENANT_BASE } from "./helpers";

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
      // .site clips overflow-x, so scrollWidth alone cannot catch text pushed past the edge; check the text itself.
      const overflowing = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p, a, button, label, li, output")]
          .filter((el) => !el.closest('#gallery [class*="reel"]')) // the gallery reel rows drift sideways by design
          .filter((el) => {
            // Inside a sideways scroller (the phone package tabs) the user can scroll to it.
            for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return false;
            return true;
          })
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && el.checkVisibility() && r.right > innerWidth + 1;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} "${el.textContent?.trim().slice(0, 40)}"`),
      );
      expect(overflowing).toEqual([]);
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
  await page.addInitScript(noWebGL);
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

test("the phone menu takes focus, makes the page inert and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(TENANT_BASE);
  const button = page.getByRole("button", { name: "Open menu" });
  await button.click();
  await expect(page.locator("#site-menu a").first()).toBeFocused();
  expect(await page.locator("main").evaluate((m) => m.hasAttribute("inert"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("main").evaluate((m) => m.hasAttribute("inert"))).toBe(false);
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

// Without JavaScript the phone nav keeps every link in the bar, so it must not sit over the section a link jumps to.
test("without JavaScript the phone nav does not cover the packages heading", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  await page.goto(`${TENANT_BASE}/#packages`);
  const navBottom = await page.locator("nav").first().evaluate((n) => n.getBoundingClientRect().bottom);
  const titleTop = await page.locator("#packages .chap").evaluate((h) => h.getBoundingClientRect().top);
  expect(navBottom).toBeLessThanOrEqual(titleTop);
  await context.close();
});

test("at 320px the nav brand and the date pill do not overlap", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(TENANT_BASE);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible(); // hydrated: phone bar layout
  const nav = page.locator("nav").first();
  const brandRight = await nav.locator("div").first().evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el); // the text itself, not the flex box, which can be wider or narrower than its text
    return r.getBoundingClientRect().right;
  });
  const pillLeft = await nav.locator('a[href="#contact"]').last().evaluate((a) => a.getBoundingClientRect().left);
  expect(brandRight).toBeLessThanOrEqual(pillLeft);
});
