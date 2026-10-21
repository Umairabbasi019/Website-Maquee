import type { Metadata } from "next";
import { t } from "@/ui/i18n";
import "./globals.css";

export const metadata: Metadata = { title: t("app.title") };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
