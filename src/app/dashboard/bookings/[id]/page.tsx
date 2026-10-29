import Link from "next/link";
import { notFound } from "next/navigation";
import { can, canAny, DASHBOARD_SCREENS } from "@/modules/access";
import { ConfirmForm, getBookingDetail, longDate, previewQuote, QuoteLines, ReasonForm, statusLabel, venueToday } from "@/modules/booking";
import { Ledger, listPayments, paymentState, summarise } from "@/modules/payments";
import { listHalls } from "@/modules/tenants";
import { formatLocalPhone, formatRs } from "@/sections/shared/format";
import { t, type TranslationKey } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../../context";
import { cancelAction, confirmAction, declineAction, previewAction } from "../actions";
import { checkOnlineAction, paymentTermsAction, recordPaymentAction, rejectPaymentAction, verifyPaymentAction } from "../payment-actions";

export const instant = false; // see layout.tsx

// A hold past its time (hold_expired) and a refund in progress cannot be cancelled: the database refuses those moves.
const CANCELLABLE = ["requested", "expired", "awaiting_advance", "confirmed"];

function Section({ id, title, children }: { id: string; title: TranslationKey; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 space-y-3">
      <h2 id={id} className="text-xl font-semibold">
        {t(title)}
      </h2>
      {children}
    </section>
  );
}

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const LEDGER_ACTIONS = {
  verify: verifyPaymentAction,
  reject: rejectPaymentAction,
  record: recordPaymentAction,
  terms: paymentTermsAction,
  check: checkOnlineAction,
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ hall?: string | string[]; payErr?: string | string[] }> };

export default async function BookingPage({ params, searchParams }: Props) {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  const screen = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/bookings")!;
  if (!canAny(viewer, venue.id, screen.perm)) return <Forbidden />;
  const b = await getBookingDetail(venue.id, (await params).id);
  if (!b) notFound();

  const edit = can(viewer, venue.id, "bookings.edit");
  // An expired request is not "requested" here, so it cannot be confirmed, only declined or cancelled.
  const confirmable = edit && b.status === "requested";
  const halls = confirmable
    ? (await listHalls(venue.id)).map((h) => {
        const fits = b.guests >= h.capacityMin && b.guests <= h.capacityMax;
        const label = !h.isActive
          ? t("bookings.confirm.hallInactive", { name: h.name })
          : fits
            ? h.name
            : t("bookings.confirm.hallNoFit", { name: h.name, min: h.capacityMin, max: h.capacityMax });
        return { id: h.id, label, disabled: !h.isActive || !fits };
      })
    : [];
  // ?hall= comes from "Update quote" without JavaScript; only a hall that fits is taken.
  const { hall: asked, payErr } = await searchParams;
  const hallId = (halls.find((h) => h.id === asked && !h.disabled) ?? halls.find((h) => !h.disabled))?.id ?? "";
  const preview = hallId ? await previewQuote(venue.id, b.id, hallId) : null;
  // The ledger shows once a quote exists (a hold, a confirmed booking, or one since cancelled or refunded).
  const rows = b.quote && can(viewer, venue.id, "payments.view") ? await listPayments(venue.id, b.id) : null;
  const ledger = b.quote && rows ? { rows, summary: summarise(b.quote.totalPaisa, b.quote.advancePaisa, rows) } : null;
  const today = ledger && b.status === "confirmed" ? await venueToday(venue.id) : null;
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: b.timeZone });

  return (
    <section>
      <Link href="/dashboard/bookings" className="underline focus-visible:outline-2 focus-visible:outline-text">
        {t("bookings.detail.back")}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{b.reference}</h1>
      <p className="mt-2">{statusLabel(b.status)}</p>

      <Section id="booking-customer" title="bookings.detail.customer">
        <Facts
          facts={[
            [t("booking.name"), b.customerName],
            [t("booking.phone"), formatLocalPhone(b.customerPhone)],
          ]}
        />
      </Section>
      <Section id="booking-choices" title="bookings.detail.choices">
        <Facts
          facts={[
            [t("booking.date"), longDate(b.eventDate)],
            [t("booking.slot"), b.slot],
            [t("booking.event"), b.eventType],
            [t("booking.guests"), String(b.guests)],
            [t("booking.package"), b.packageName ?? t("booking.noPackage")],
            [t("booking.addons"), b.addons.join(", ") || t("booking.view.none")],
            ...(b.hall ? [[t("booking.view.hall"), b.hall] as [string, string]] : []),
          ]}
        />
      </Section>
      {b.quote && (
        <Section id="booking-quote" title="bookings.detail.quote">
          <div className="max-w-md">
            <QuoteLines quote={b.quote} />
            {b.override && (
              <p className="mt-2">{t("bookings.detail.override", { from: formatRs(b.override.calculatedPaisa), reason: b.override.reason })}</p>
            )}
          </div>
        </Section>
      )}
      {confirmable && (
        <Section id="booking-confirm" title="bookings.confirm.heading">
          <ConfirmForm
            bookingId={b.id}
            halls={halls}
            hallId={hallId}
            preview={preview}
            canOverride={can(viewer, venue.id, "quotes.override")}
            action={confirmAction}
            previewAction={previewAction}
          />
        </Section>
      )}
      {edit && (b.status === "requested" || b.status === "expired") && (
        <Section id="booking-decline" title="bookings.decline.heading">
          <ReasonForm bookingId={b.id} kind="decline" action={declineAction} />
        </Section>
      )}
      {ledger && (
        <Section id="booking-payments" title="pay.ledger.heading">
          <Ledger
            bookingId={b.id}
            rows={ledger.rows}
            summary={ledger.summary}
            state={today ? paymentState(ledger.summary, b, today) : null}
            terms={today ? b : null}
            canVerify={can(viewer, venue.id, "payments.verify")}
            actions={LEDGER_ACTIONS}
            receiptHref={(paymentId) => `/dashboard/bookings/receipt/${paymentId}`}
            error={typeof payErr === "string" ? payErr : undefined}
          />
        </Section>
      )}
      {edit && CANCELLABLE.includes(b.status) && (
        <Section id="booking-cancel" title="bookings.cancel.heading">
          <ReasonForm bookingId={b.id} kind="cancel" paidPaisa={ledger?.summary.paidPaisa} action={cancelAction} />
        </Section>
      )}
      <Section id="booking-history" title="bookings.detail.history">
        <ol className="space-y-2">
          {b.history.map((h, i) => (
            <li key={i}>
              <time dateTime={h.at}>{when.format(new Date(h.at))}</time>
              {": "}
              {h.from ? t("bookings.history.change", { from: statusLabel(h.from), to: statusLabel(h.to) }) : t("bookings.history.new")}
              {h.reason && <span className="block">{h.reason}</span>}
            </li>
          ))}
        </ol>
      </Section>
    </section>
  );
}
