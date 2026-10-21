import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isPlatformHost } from "@/modules/tenants";
import { t } from "@/ui/i18n";

// shortcut: no tenant public site yet (later milestone). This page only shows the holding page
// for a paused tenant and the platform 404 for unknown hosts; the real site replaces the rest.
async function Home() {
  const h = await headers();
  // Set by src/proxy.ts from the host; any copy sent by the browser is dropped there.
  if (!h.get("x-tenant-id") && !isPlatformHost(h.get("host") ?? "")) notFound();
  if (h.get("x-tenant-status") === "paused") {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t("holding.heading")}</h1>
        <p className="mt-2">{t("holding.body")}</p>
      </>
    );
  }
  return <h1 className="text-2xl">{t("home.heading")}</h1>;
}

export default function HomePage() {
  return (
    <main className="p-8">
      <Suspense fallback={<p>{t("loading")}</p>}>
        <Home />
      </Suspense>
    </main>
  );
}
