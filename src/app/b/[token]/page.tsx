import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingView, getBookingByToken } from "@/modules/booking";
import { SitePage } from "@/modules/site";
import { hostSite } from "../../book/host";

// Per token, read on every request; never cached.
export const instant = false;

// The token in the URL is the customer's credential: never indexed, and never sent on as a referrer.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The customer's private link. The token finds the booking only on its own venue's host; anything else is the same 404. */
export default async function CustomerBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const site = await hostSite();
  const view = await getBookingByToken((await params).token, site.tenantId);
  if (!view) notFound();
  return (
    <SitePage site={site}>
      <BookingView view={view} />
    </SitePage>
  );
}
