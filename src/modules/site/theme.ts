import type { CSSProperties } from "react";
import type { TenantSettings } from "@/modules/tenants";

// The --f-* variables are defined by the next/font classes in fonts.ts; keep the names in step.
const LOADED_FONTS: Record<string, string> = {
  "Cormorant Garamond": "var(--f-cormorant), Georgia, serif",
  Inter: "var(--f-inter), system-ui, sans-serif",
};

/** The fonts the site loads, for the editor's font choice. */
export const FONT_NAMES = Object.keys(LOADED_FONTS);

// Settings validate colours as #rrggbb, so slicing the hex is safe. Rough perceived brightness (0-255), midpoint 128.
function colorSchemeFor(background: string): "dark" | "light" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? "dark" : "light";
}

export function themeStyle(theme: TenantSettings["theme"]): CSSProperties {
  const { colors, fonts } = theme;
  return {
    colorScheme: colorSchemeFor(colors.background),
    "--color-bg": colors.background,
    "--color-accent": colors.primary,
    "--color-text": colors.text,
    "--color-muted": colors.muted,
    "--color-deep": colors.deep,
    "--font-heading": LOADED_FONTS[fonts.heading] ?? "Georgia, serif",
    "--font-body": LOADED_FONTS[fonts.body] ?? "system-ui, sans-serif",
  } as CSSProperties;
}
