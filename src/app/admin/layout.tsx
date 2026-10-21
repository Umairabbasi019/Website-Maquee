import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/ui/i18n";
import { signOut } from "../login/actions";
import { adminGate } from "./guard";

// Access is read fresh on every request, so navigation may block (same as the dashboard).
export const instant = false;

export const metadata: Metadata = { title: t("admin.heading"), robots: { index: false, follow: false } };

const linkClass =
  "rounded-md px-3 py-2 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

async function Chrome({ children }: { children: React.ReactNode }) {
  const isAdmin = await adminGate();
  return (
    <>
      {isAdmin && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-muted/40 px-4 py-3">
          <Link href="/admin" className={`${linkClass} font-semibold`}>
            {t("admin.heading")}
          </Link>
          <form action={signOut}>
            <button type="submit" className={linkClass}>
              {t("signOut")}
            </button>
          </form>
        </header>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8">{t("loading")}</p>}>
      <Chrome>{children}</Chrome>
    </Suspense>
  );
}
