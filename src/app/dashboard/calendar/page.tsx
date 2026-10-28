import Link from "next/link";
import { canAny, DASHBOARD_SCREENS } from "@/modules/access";
import { getRequestOptions, listBookings, MonthCalendar } from "@/modules/booking";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";

export const instant = false; // see layout.tsx

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Declined and cancelled bookings hold nothing, so the calendar leaves them out; the list still has them.
const SHOWN = new Set(["requested", "expired", "confirmed"]);

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  const screen = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/calendar")!;
  if (!canAny(viewer, venue.id, screen.perm)) return <Forbidden />;
  const { month: asked } = await searchParams;
  // No (or a bad) month opens the venue's current month; getRequestOptions knows the venue's today.
  const month = typeof asked === "string" && MONTH.test(asked) ? asked : (await getRequestOptions(venue.id)).today.slice(0, 7);
  const entries = (await listBookings(venue.id, { month })).filter((b) => SHOWN.has(b.status));
  const nav = "rounded-md border border-muted/40 px-3 py-1 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-text";

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("nav.calendar")}</h1>
      <nav aria-label={t("calendar.months")} className="mt-4 flex gap-2">
        <Link href={`/dashboard/calendar?month=${shift(month, -1)}`} className={nav}>
          {t("calendar.prev")}
        </Link>
        <Link href={`/dashboard/calendar?month=${shift(month, 1)}`} className={nav}>
          {t("calendar.next")}
        </Link>
      </nav>
      <MonthCalendar month={month} entries={entries} hrefBase="/dashboard/bookings" />
    </section>
  );
}
