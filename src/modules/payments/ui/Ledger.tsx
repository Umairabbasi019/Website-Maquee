import { formatRs, rupeesInput } from "@/sections/shared/format";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import type { LedgerSummary, PaymentRow, PaymentState } from "../ledger";

const LEDGER_ERRORS = ["invalid", "forbidden", "notFound", "state", "amount", "limit"];
const ROW_STATUS = { pending: "pay.row.checking", verified: "pay.row.verified", rejected: "pay.row.rejected" } as const;
const STAFF_METHODS = ["bank", "jazzcash", "easypaisa", "cash"] as const;

type Action = (fd: FormData) => Promise<void>;
type Actions = { verify: Action; reject: Action; record: Action; terms: Action; check: Action };

type Props = {
  bookingId: string;
  rows: PaymentRow[];
  summary: LedgerSummary;
  /** The money label of a confirmed booking; null for any other status. */
  state: PaymentState | null;
  /** Set for a confirmed booking: the terms form shows. */
  terms: { advanceDueOn: string | null; payLater: boolean } | null;
  /** Forms show only with payments.verify. The server action checks it again. */
  canVerify: boolean;
  /** Plain forms bound to Server Actions, so the ledger works without JavaScript. */
  actions: Actions;
  /** Where a receipt's link is made: a route that redirects to a short-lived signed URL, so no URL is kept on the page. */
  receiptHref: (paymentId: string) => string;
  /** From the URL: only picks which message to show. */
  error: string | undefined;
};

function Button({ name, value, children }: { name?: string; value?: string; children: React.ReactNode }) {
  return (
    <button name={name} value={value} className={buttonClass}>
      {children}
    </button>
  );
}

function RowActions({ row, bookingId, actions }: { row: PaymentRow; bookingId: string; actions: Actions }) {
  const ids = (
    <>
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="paymentId" value={row.id} />
    </>
  );
  const awaitingStaff = row.status === "pending" && row.source === "customer_receipt";
  const label = formatRs(row.amountPaisa);
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      {awaitingStaff && (
        <>
          <form action={actions.verify} aria-label={`${t("pay.ledger.verify")} ${label}`} className="flex items-end gap-2">
            {ids}
            <label>
              {t("pay.ledger.verifyAmount")}
              <input name="amount" inputMode="decimal" required defaultValue={rupeesInput(row.amountPaisa)} className={inputClass} />
            </label>
            <Button>{t("pay.ledger.verify")}</Button>
          </form>
          <form action={actions.reject} aria-label={`${t("pay.ledger.reject")} ${label}`} className="flex items-end gap-2">
            {ids}
            <label>
              {t("pay.ledger.rejectReason")}
              <input name="reason" required minLength={3} maxLength={300} className={inputClass} />
            </label>
            <Button>{t("pay.ledger.reject")}</Button>
          </form>
        </>
      )}
      {row.status === "pending" && row.method === "online" && (
        <form action={actions.check}>
          {ids}
          <Button>{t("pay.ledger.check")}</Button>
        </form>
      )}
    </div>
  );
}

/** A booking's money for staff: the sums, the state label, every ledger row, and (for payments.verify) the forms that change them. */
export function Ledger({ bookingId, rows, summary: s, state, terms, canVerify, actions, receiptHref, error }: Props) {
  return (
    <div className="space-y-4">
      {error && LEDGER_ERRORS.includes(error) && <p role="alert">{t(`pay.ledger.err.${error}` as TranslationKey)}</p>}
      {state && <p className="font-medium">{t(`pay.state.${state}`)}</p>}
      <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {(
          [
            ["pay.ledger.total", s.totalPaisa],
            ["pay.ledger.advance", s.advancePaisa],
            ["pay.ledger.paid", s.paidPaisa],
            ["pay.ledger.balance", s.balancePaisa],
          ] as const
        ).map(([label, paisa]) => (
          <div key={label} className="contents">
            <dt className="font-medium">{t(label)}</dt>
            <dd>{formatRs(paisa)}</dd>
          </div>
        ))}
      </dl>
      {rows.length === 0 ? (
        <p>{t("pay.ledger.none")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-muted/40 p-3">
              <p>
                {t(`pay.ledger.kind.${r.kind}`)}, {t(`pay.method.${r.method}`)}, {formatRs(r.amountPaisa)}: <strong>{t(ROW_STATUS[r.status])}</strong>
              </p>
              {r.note && <p>{r.note}</p>}
              {r.rejectReason && <p>{r.rejectReason}</p>}
              {r.hasReceipt && (
                <a href={receiptHref(r.id)} target="_blank" rel="noreferrer" className="underline focus-visible:outline-2 focus-visible:outline-text">
                  {t("pay.ledger.view")}
                </a>
              )}
              {canVerify && <RowActions row={r} bookingId={bookingId} actions={actions} />}
            </li>
          ))}
        </ul>
      )}
      {canVerify && (
        <form action={actions.record} aria-label={t("pay.ledger.record")} className="space-y-3">
          <input type="hidden" name="id" value={bookingId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              {t("pay.ledger.method")}
              <select name="method" required className={inputClass}>
                {STAFF_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`pay.method.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("pay.ledger.amount")}
              <input name="amount" inputMode="decimal" required className={inputClass} />
            </label>
            <label>
              {t("pay.ledger.note")}
              <input name="note" maxLength={300} className={inputClass} />
            </label>
          </div>
          <div className="flex gap-3">
            <Button name="kind" value="payment">
              {t("pay.ledger.recordPayment")}
            </Button>
            <Button name="kind" value="refund">
              {t("pay.ledger.recordRefund")}
            </Button>
          </div>
        </form>
      )}
      {canVerify && terms && (
        <form action={actions.terms} aria-label={t("pay.ledger.terms")} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={bookingId} />
          <label>
            {t("pay.ledger.dueOn")}
            <input name="advanceDueOn" type="date" required defaultValue={terms.advanceDueOn ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2">
            <input name="payLater" type="checkbox" defaultChecked={terms.payLater} />
            {t("pay.ledger.payLater")}
          </label>
          <Button>{t("pay.ledger.saveTerms")}</Button>
        </form>
      )}
    </div>
  );
}
