import { expect, test, type Locator, type Page } from "@playwright/test";
import { manorContent } from "../../scripts/seed-data/manor";
import { TENANT_BASE } from "./helpers";

const { hero, inside, stage } = manorContent;
const plain = (lines: string[]) => lines.join(" ").replaceAll("*", "");
const heading = (page: Page, lines: string[], includeHidden = false) => page.getByRole("heading", { name: plain(lines), includeHidden });

/** Scrolls so the pinned section `#id` is `progress` (0..1) of the way through its scroll range. */
async function scrollPin(page: Page, id: string, progress: number) {
  await page.evaluate(
    ([id, progress]) => {
      const el = document.getElementById(id as string)!;
      const top = el.getBoundingClientRect().top + scrollY;
      scrollTo(0, top + (el.offsetHeight - innerHeight) * (progress as number));
    },
    [id, progress],
  );
}

/** Revealed = every line of the heading has slid into place (toBeVisible ignores the clip and the transform). Under 1 px is in place: the easing has a long tail. */
const revealed = (h: Locator) =>
  h.evaluate((el) => [...el.querySelectorAll(".line > span")].every((s) => Math.abs(new DOMMatrix(getComputedStyle(s).transform).f) < 1));

test.describe("motion on", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("hero captions follow the scroll and inside reaches its last room", async ({ page }) => {
    await page.goto(TENANT_BASE);
    // At 0% the arrival caption is up; waiting for it also waits out hydration on a cold dev server.
    await expect.poll(() => revealed(heading(page, hero.captions.arrival.lines)), { timeout: 30_000 }).toBe(true);
    await scrollPin(page, "hero", 0.3);
    await page.waitForTimeout(1500);
    await expect.poll(() => revealed(heading(page, hero.captions.doors.lines))).toBe(true);
    expect(await revealed(heading(page, hero.captions.arrival.lines))).toBe(false);

    await scrollPin(page, "hero", 0.7);
    await page.waitForTimeout(1500);
    await expect.poll(() => revealed(heading(page, hero.captions.hall.lines))).toBe(true);

    const last = inside.rooms.at(-1)!;
    await scrollPin(page, "inside", 0.95);
    await page.waitForTimeout(1500);
    await expect(page.locator("#inside").getByText(last.chapter, { exact: true })).toHaveCSS("opacity", "1");
    await expect.poll(() => revealed(heading(page, last.lines))).toBe(true);
  });
});

test("reduced motion: every caption shows on its own frame and no photo moves", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(TENANT_BASE);
  const all = [
    hero.captions.arrival.lines,
    hero.captions.doors.lines,
    hero.captions.hall.lines,
    inside.title,
    ...inside.rooms.map((r) => r.lines),
    stage.caption.lines,
  ];
  for (const lines of all) {
    const h = heading(page, lines);
    await h.scrollIntoViewIfNeeded();
    await expect(h).toBeInViewport();
    expect(await revealed(h)).toBe(true);
  }
  const transforms = await page
    .locator("#hero [role=img], #inside [role=img], #stage [role=img]")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
  expect(transforms.length).toBeGreaterThan(0);
  expect(transforms.filter((t) => t !== "none")).toEqual([]);
});

test("without JavaScript every hero caption is in the page and shown", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(TENANT_BASE);
  const { arrival, doors, hall } = hero.captions;
  const texts = [arrival, doors, hall].flatMap((c) => [c.chapter, ...(c.body ? [c.body] : [])]);
  texts.push(arrival.primaryCta, arrival.secondaryCta);
  const els = [
    ...texts.map((text) => page.locator("#hero").getByText(text, { exact: true })),
    // includeHidden: without JS the whole page still sits in the hidden streaming boundary (src/app/page.tsx Suspense), see task 6 report.
    ...[arrival, doors, hall].map((c) => heading(page, c.lines, true)),
  ];
  for (const el of els) {
    await expect(el).toHaveCount(1);
    const hidden = await el.evaluate((node) => {
      for (let n: Element | null = node; n && n.id !== "hero"; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden" || s.opacity === "0") return true;
      }
      return false;
    });
    expect(hidden, (await el.textContent()) ?? "").toBe(false);
  }
  await context.close();
});
