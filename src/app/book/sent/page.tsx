import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBookingByToken, RequestSent } from "@/modules/booking";
import { SitePage } from "@/modules/site";
import { hostSite } from "../host";

// Per token, read on every request; never cached.
export const instant = false;

// The token in the URL is the customer's credential: never indexed, and never sent on as a referrer.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const site = await hostSite();
  const { t: token } = await searchParams;
  const view = typeof token === "string" ? await getBookingByToken(token, site.tenantId) : null;
  if (!view) notFound();
  return (
    <SitePage site={site}>
      <RequestSent reference={view.reference} link={`/b/${token}`} />
    </SitePage>
  );
}
