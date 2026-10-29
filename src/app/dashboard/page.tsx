import Link from "next/link";
import { redirect } from "next/navigation";
import { can, dashboardNav } from "@/modules/access";
import { countNewRequests } from "@/modules/booking";
import { Alerts, getPaymentAlerts } from "@/modules/payments";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "./context";

export const instant = false; // see layout.tsx

export default async function OverviewPage() {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null; // the layout shows the venue picker or the paused notice
  if (!can(viewer, venue.id, "bookings.view")) {
    // Land on the first screen this role holds (staff: the schedule).
    const first = dashboardNav(viewer, venue.id)[0];
    if (first) redirect(first.href);
    return <Forbidden />;
  }
  const [count, alerts] = await Promise.all([countNewRequests(venue.id), can(viewer, venue.id, "payments.verify") ? getPaymentAlerts(venue.id) : null]);
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("nav.overview")}</h1>
      {alerts && <Alerts alerts={alerts} />}
      <Link
        href="/dashboard/bookings?status=requested"
        className="mt-6 inline-block rounded-lg border border-muted/40 p-6 text-lg font-medium hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      >
        {t("bookings.overview.new", { count })}
      </Link>
    </section>
  );
}
