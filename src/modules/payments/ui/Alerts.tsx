import Link from "next/link";
import { t } from "@/ui/i18n";
import type { PaymentAlerts } from "../server/alerts";

/** In the order the overview shows them. The bookings list takes these as `?alert=`. */
export const ALERT_KEYS = ["receiptsToReview", "refundDue", "advanceOverdue", "onlineStuck", "rejectedAfterEvent"] as const satisfies readonly (keyof PaymentAlerts)[];

/** The overview's payment alerts. Each links to its booking, or to the list of them when there are several. Nothing shows when all are clear. */
export function Alerts({ alerts }: { alerts: PaymentAlerts }) {
  const active = ALERT_KEYS.filter((k) => alerts[k].length > 0);
  if (active.length === 0) return null;
  return (
    <section aria-labelledby="payment-alerts" className="mt-6">
      <h2 id="payment-alerts" className="text-xl font-semibold">
        {t("pay.alert.heading")}
      </h2>
      <ul className="mt-3 space-y-2">
        {active.map((k) => (
          <li key={k}>
            <Link
              href={alerts[k].length === 1 ? `/dashboard/bookings/${alerts[k][0]}` : `/dashboard/bookings?alert=${k}`}
              className="underline focus-visible:outline-2 focus-visible:outline-text"
            >
              {t(`pay.alert.${k}`, { count: alerts[k].length })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
