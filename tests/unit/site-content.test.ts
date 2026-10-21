import { describe, expect, it } from "vitest";
import { MediaRefSchema, SiteContentSchema, ThemeSchema } from "@/modules/tenants";
import { demoContent } from "../../scripts/seed-data/demo";
import { manorContent } from "../../scripts/seed-data/manor";
import { defaultSettings } from "./fixtures/tenant-settings";

describe("site content schema", () => {
  it.each([
    ["manor", manorContent],
    ["demo", demoContent],
  ])("accepts the %s seed content", (_name, content) => {
    expect(SiteContentSchema.safeParse(content).success).toBe(true);
  });

  it("rejects an events CTA without the {event} token", () => {
    const bad = { ...manorContent, events: { ...manorContent.events, checkCta: "Check a date" } };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a guest default above the max", () => {
    const bad = { ...manorContent, contact: { ...manorContent.contact, guests: { min: 50, max: 1000, step: 25, default: 2000 } } };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it("defaults hero.mode to photos", () => {
    const hero = { ...manorContent.hero, mode: undefined };
    expect(SiteContentSchema.parse({ ...manorContent, hero }).hero.mode).toBe("photos");
  });

  it("rejects a media focus that is not two percentages", () => {
    expect(MediaRefSchema.safeParse({ key: "a", focus: "center" }).success).toBe(false);
    expect(MediaRefSchema.safeParse({ key: "a", focus: "50% 58%" }).success).toBe(true);
  });

  it("requires colors.deep in the theme", () => {
    const colors = { ...defaultSettings.theme.colors, deep: undefined };
    expect(ThemeSchema.safeParse({ ...defaultSettings.theme, colors }).success).toBe(false);
  });
});
