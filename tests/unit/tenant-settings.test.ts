import { describe, expect, it } from "vitest";
import {
  MoneyRulesSchema,
  SectionsSchema,
  SlugSchema,
  ThemeSchema,
  setupChecklist,
} from "@/modules/tenants";
import { defaultSettings } from "./fixtures/tenant-settings";

const keys = ["hero", "inside", "stage", "gallery", "events", "packages", "contact", "footer"] as const;
const sections = keys.map((key) => ({ key, visible: true }));

describe("tenant settings schemas", () => {
  it("rejects a theme colour that is not #rrggbb", () => {
    const theme = { ...defaultSettings.theme, colors: { ...defaultSettings.theme.colors, primary: "red" } };
    expect(ThemeSchema.safeParse(theme).success).toBe(false);
    expect(ThemeSchema.safeParse(defaultSettings.theme).success).toBe(true);
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(SlugSchema.safeParse("The Manor").success).toBe(false);
    expect(SlugSchema.safeParse("Manor").success).toBe(false);
    expect(SlugSchema.safeParse("the-manor-2").success).toBe(true);
  });

  it("requires each section key exactly once", () => {
    expect(SectionsSchema.safeParse(sections).success).toBe(true);
    expect(SectionsSchema.safeParse(sections.slice(1)).success).toBe(false);
    expect(SectionsSchema.safeParse([...sections.slice(1), sections[1]]).success).toBe(false);
  });

  it("defaults hold hours, currency and time zone", () => {
    expect(MoneyRulesSchema.parse({})).toMatchObject({
      holdHours: 48,
      currency: "PKR",
      timeZone: "Asia/Karachi",
    });
  });
});

describe("setupChecklist", () => {
  const full = { domains: 1, halls: 1, packages: 1, heroMedia: 1, paymentAccounts: 1 };
  const done = (counts: typeof full) =>
    Object.fromEntries(setupChecklist(defaultSettings, counts).map((i) => [i.item, i.done]));

  it("marks domain false with 0 domains", () => {
    expect(done({ ...full, domains: 0 }).domain).toBe(false);
  });

  it("marks every item done when all counts and contacts exist", () => {
    expect(Object.values(done(full)).every(Boolean)).toBe(true);
  });

  it("marks contacts false without a phone", () => {
    const s = { ...defaultSettings, identity: { ...defaultSettings.identity, phones: [] } };
    expect(setupChecklist(s, full).find((i) => i.item === "contacts")?.done).toBe(false);
  });
});
