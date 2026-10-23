import type { Metadata } from "next";
import { t } from "@/ui/i18n";
import "./globals.css";

export const metadata: Metadata = { title: t("app.title") };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // SiteShell's inline script adds html.js before hydration; React must not flag that one attribute.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
