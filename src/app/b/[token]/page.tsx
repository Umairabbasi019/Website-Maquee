import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingView, getBookingByToken } from "@/modules/booking";
import { getCustomerPayments, PaymentPanel } from "@/modules/payments";
import { SitePage } from "@/modules/site";
import { t } from "@/ui/i18n";
import { hostSite } from "../../book/host";
import { payOnlineAction, uploadReceiptAction } from "./actions";

// Per token, read on every request; never cached.
export const instant = false;

// The token in the URL is the customer's credential: never indexed, and never sent to another site as a referrer. Same-origin, not none: with no referrer the browser sends "Origin: null" on a form post and Next refuses the Server Action.
export async function generateMetadata(): Promise<Metadata> {
  const site = await hostSite();
  return { title: `${t("booking.view.heading")} | ${site.name}`, robots: { index: false, follow: false }, referrer: "same-origin" };
}

/** The customer's private link. The token finds the booking only on its own venue's host; anything else is the same 404. */
export default async function CustomerBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; err?: string }>;
}) {
  const site = await hostSite();
  const { token } = await params;
  const view = await getBookingByToken(token, site.tenantId);
  if (!view) notFound();
  const [payments, query] = await Promise.all([getCustomerPayments(site.tenantId, view.id), searchParams]);
  return (
    <SitePage site={site}>
      <BookingView view={view} />
      {payments && (
        <PaymentPanel
          payments={payments}
          uploadAction={uploadReceiptAction.bind(null, token)}
          payOnlineAction={payOnlineAction.bind(null, token)}
          sent={query.sent === "1"}
          error={query.err}
        />
      )}
    </SitePage>
  );
}
