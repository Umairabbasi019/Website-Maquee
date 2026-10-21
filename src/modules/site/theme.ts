import type { CSSProperties } from "react";
import type { TenantSettings } from "@/modules/tenants";

// The --f-* variables are defined by the next/font classes in fonts.ts; keep the names in step.
const LOADED_FONTS: Record<string, string> = {
  "Cormorant Garamond": "var(--f-cormorant), Georgia, serif",
  Inter: "var(--f-inter), system-ui, sans-serif",
};

export function themeStyle(theme: TenantSettings["theme"]): CSSProperties {
  const { colors, fonts } = theme;
  return {
    "--color-bg": colors.background,
    "--color-accent": colors.primary,
    "--color-text": colors.text,
    "--color-muted": colors.muted,
    "--color-deep": colors.deep,
    "--font-heading": LOADED_FONTS[fonts.heading] ?? "Georgia, serif",
    "--font-body": LOADED_FONTS[fonts.body] ?? "system-ui, sans-serif",
  } as CSSProperties;
}
