import Link from "next/link";
import { canAny, DASHBOARD_SCREENS } from "@/modules/access";
import { listBookings, longDate, statusLabel } from "@/modules/booking";
import { formatLocalPhone, formatRs } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";

export const instant = false; // see layout.tsx

const FILTERS = ["requested", "expired", "confirmed", "declined", "cancelled"];
const cell = "border-b border-muted/40 p-2 text-left align-top";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  const screen = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/bookings")!;
  if (!canAny(viewer, venue.id, screen.perm)) return <Forbidden />;
  const { status } = await searchParams;
  const current = typeof status === "string" && FILTERS.includes(status) ? status : undefined;
  const rows = await listBookings(venue.id, { status: current });

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("nav.bookings")}</h1>
      <nav aria-label={t("bookings.filter.label")} className="mt-4">
        <ul className="flex flex-wrap gap-2">
          {[undefined, ...FILTERS].map((f) => (
            <li key={f ?? "all"}>
              <Link
                href={f ? `/dashboard/bookings?status=${f}` : "/dashboard/bookings"}
                aria-current={f === current ? "page" : undefined}
                className="block rounded-md border border-muted/40 px-3 py-1 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-text aria-[current=page]:border-text aria-[current=page]:font-medium"
              >
                {f ? statusLabel(f) : t("bookings.filter.all")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <p className="mt-6">{t("bookings.none")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">{current ? statusLabel(current) : t("nav.bookings")}</caption>
            <thead>
              <tr>
                {(
                  [
                    "bookings.col.reference",
                    "booking.date",
                    "booking.slot",
                    "bookings.col.customer",
                    "bookings.col.phone",
                    "booking.guests",
                    "booking.view.hall",
                    "bookings.col.status",
                    "booking.view.total",
                  ] as const
                ).map((k) => (
                  <th key={k} scope="col" className={`${cell} font-medium`}>
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <th scope="row" className={`${cell} font-normal`}>
                    <Link href={`/dashboard/bookings/${b.id}`} className="underline focus-visible:outline-2 focus-visible:outline-text">
                      {b.reference}
                    </Link>
                  </th>
                  <td className={cell}>{longDate(b.eventDate)}</td>
                  <td className={cell}>{b.slot}</td>
                  <td className={cell}>{b.customerName}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatLocalPhone(b.customerPhone)}</td>
                  <td className={cell}>{b.guests}</td>
                  <td className={cell}>{b.hall ?? "—"}</td>
                  <td className={cell}>{statusLabel(b.status)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{b.totalPaisa === null ? "—" : formatRs(b.totalPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
