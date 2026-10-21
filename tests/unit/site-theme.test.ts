import { describe, expect, it } from "vitest";
import { themeStyle } from "@/modules/site";
import { manorTheme } from "../../scripts/seed-data/manor";

const vars = (theme: Parameters<typeof themeStyle>[0]) => themeStyle(theme) as Record<string, string>;

describe("themeStyle", () => {
  it("maps theme colours to CSS variables", () => {
    expect(vars(manorTheme)["--color-deep"]).toBe("#5b0f1a");
    expect(vars(manorTheme)["--color-accent"]).toBe(manorTheme.colors.primary);
    expect(vars(manorTheme)["--color-bg"]).toBe(manorTheme.colors.background);
  });
  it("uses the loaded font for known names", () => {
    expect(vars(manorTheme)["--font-heading"]).toContain("--f-cormorant");
    expect(vars(manorTheme)["--font-body"]).toContain("--f-inter");
  });
  it("falls back to system fonts for unknown names", () => {
    const style = vars({ ...manorTheme, fonts: { heading: "Papyrus", body: "Comic Sans" } });
    expect(style["--font-heading"]).toContain("Georgia");
    expect(style["--font-body"]).toContain("system-ui");
  });
});
