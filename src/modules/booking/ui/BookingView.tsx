import { formatRs } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import type { CustomerBookingView } from "../server/token";
import styles from "./booking.module.css";
import { longDate } from "./labels";

const STATUS = {
  requested: "booking.status.requested",
  awaiting_advance: "booking.status.awaiting_advance",
  confirmed: "booking.status.confirmed",
  hold_expired: "booking.status.hold_expired",
  refund_pending: "booking.status.refund_pending",
  refunded: "booking.status.refunded",
  expired: "booking.status.expired",
  declined: "booking.notConfirmed",
  cancelled: "booking.cancelled",
} as const;

/** What the customer's private link shows. The price appears once a hall is held or confirmed: the stored total and advance, never a re-sum of the lines. */
export function BookingView({ view }: { view: CustomerBookingView }) {
  const facts: [string, string][] = [
    [t("booking.date"), longDate(view.eventDate)],
    [t("booking.slot"), view.slot],
    [t("booking.event"), view.eventType],
    [t("booking.guests"), String(view.guests)],
    [t("booking.package"), view.packageName ?? t("booking.noPackage")],
    [t("booking.addons"), view.addons.join(", ") || t("booking.view.none")],
    ...(view.hall ? [[t("booking.view.hall"), view.hall] as [string, string]] : []),
  ];
  const q = view.quote;

  return (
    <>
      <h1 className={styles.title}>{t("booking.view.heading")}</h1>
      <div className={styles.card}>
        <div>
          <span className={styles.lab}>{t("booking.sent.reference")}</span>
          <span className={styles.ref}>{view.reference}</span>
        </div>
        <p>{t(STATUS[view.status])}</p>
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {q && (
          <section aria-labelledby="booking-price">
            <h2 id="booking-price" className={styles.lab}>
              {t("booking.view.price")}
            </h2>
            <ul className={styles.lines}>
              {q.lines.map((l, i) => (
                <li key={i}>
                  <span>{l.label}</span>
                  <span>{formatRs(l.amountPaisa)}</span>
                </li>
              ))}
              <li className={styles.sum}>
                <span>{t("booking.view.total")}</span>
                <span>{formatRs(q.totalPaisa)}</span>
              </li>
              <li>
                <span>{t("booking.view.advance")}</span>
                <span>{formatRs(q.advancePaisa)}</span>
              </li>
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/** The page after a request: the reference and the private link, from the stored booking (never from the URL). */
export function RequestSent({ reference, link }: { reference: string; link: string }) {
  return (
    <>
      <h1 className={styles.title}>{t("booking.sent.heading")}</h1>
      <div className={styles.card}>
        <div>
          <span className={styles.lab}>{t("booking.sent.reference")}</span>
          <span className={styles.ref} data-testid="reference">
            {reference}
          </span>
        </div>
        <p>{t("booking.sent.body")}</p>
        <p>{t("booking.sent.link")}</p>
        <div>
          <a className="pill" href={link}>
            {t("booking.sent.open")}
          </a>
        </div>
      </div>
    </>
  );
}
