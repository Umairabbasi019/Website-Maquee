import { redirect } from "next/navigation";
import { can, dashboardNav } from "@/modules/access";
import { t } from "@/ui/i18n";
import { ComingSoon, Forbidden } from "@/ui/notices";
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
  return <ComingSoon title={t("nav.overview")} />;
}
