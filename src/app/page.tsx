import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eventVenueJsonLd, getPublicSite, siteMetadata, SiteShell } from "@/modules/site";
import { isPlatformHost, normalizeHost } from "@/modules/tenants";
import { t } from "@/ui/i18n";

// Allowed to block: the page renders whole per request with no Suspense boundary, because React outlines a large
// completed boundary into a hidden segment that only JavaScript reveals, and the site must work without JavaScript.
export const instant = false;

// Tenant headers are set by src/proxy.ts from the host; any copy sent by the browser is dropped there.
async function request() {
  const h = await headers();
  const host = h.get("host") ?? "";
  const tenantId = h.get("x-tenant-id");
  if (!tenantId && !isPlatformHost(host)) notFound();
  return { tenantId, status: h.get("x-tenant-status"), host: normalizeHost(host) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { tenantId, status, host } = await request();
  if (!tenantId) return {};
  if (status === "paused") return { robots: { index: false } };
  const site = await getPublicSite(tenantId);
  return site ? siteMetadata(site, host) : {};
}

export default async function HomePage() {
  const { tenantId, status, host } = await request();
  if (!tenantId) {
    return (
      <main className="p-8">
        <h1 className="text-2xl">{t("home.heading")}</h1>
      </main>
    );
  }
  if (status === "paused") {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">{t("holding.heading")}</h1>
        <p className="mt-2">{t("holding.body")}</p>
      </main>
    );
  }
  const site = await getPublicSite(tenantId);
  if (!site) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        // "<" is escaped so venue text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventVenueJsonLd(site, host)).replace(/</g, "\\u003c") }}
      />
      <SiteShell site={site} />
    </>
  );
}
