import { formatRs, rupeesInput } from "@/sections/shared/format";
import { t, type TranslationKey } from "@/ui/i18n";
import type { CustomerPayments } from "../customer-view";
import styles from "./payments.module.css";

const ERRORS = ["invalid", "type", "tooLarge", "amount", "limit", "state", "off"];
const ROW_STATUS = { pending: "pay.row.checking", verified: "pay.row.verified", rejected: "pay.row.rejected" } as const;

type Props = {
  payments: CustomerPayments;
  /** Server Actions bound to the link's token; plain forms, so the panel works without JavaScript. */
  uploadAction: (fd: FormData) => Promise<void>;
  payOnlineAction: () => Promise<void>;
  /** From the URL: only picks which message to show, never what the panel says is paid. */
  error: string | undefined;
};

/** The money part of the customer's private link: what is paid, what is being checked, where to pay and the receipt form. */
export function PaymentPanel({ payments: p, uploadAction, payOnlineAction, error }: Props) {
  const { summary: s } = p;
  // The advance still owed, else the balance: what a receipt most likely is for.
  const due = s.advanceMet ? s.balancePaisa : s.advancePaisa - s.paidPaisa;
  const checking = p.rows.some((r) => r.method === "online" && r.status === "pending");
  return (
    <section className={styles.panel} aria-labelledby="pay-heading">
      <h2 id="pay-heading" className={styles.lab}>
        {t("pay.heading")}
      </h2>
      <ul className={styles.sums}>
        <li>
          <span>{t("pay.paid")}</span>
          <span>{formatRs(s.paidPaisa)}</span>
        </li>
        <li>
          <span>{t("pay.balance")}</span>
          <span>{formatRs(Math.max(0, s.balancePaisa))}</span>
        </li>
      </ul>
      {checking && (
        <p role="status" className={styles.note}>
          {t("pay.checking")}
        </p>
      )}
      {error && ERRORS.includes(error) && (
        <p role="alert" className={styles.note}>
          {t(`pay.err.${error}` as TranslationKey)}
        </p>
      )}
      {p.rows.length > 0 && (
        <ul className={styles.rows}>
          {p.rows.map((r) => (
            <li key={r.id}>
              <span>
                {r.kind === "refund" ? `${t("pay.row.refund")}, ` : ""}
                {t(`pay.method.${r.method}`)}, {formatRs(r.amountPaisa)}
                {r.status === "rejected" && r.rejectReason && <small className={styles.why}>{r.rejectReason}</small>}
              </span>
              <span>{t(ROW_STATUS[r.status])}</span>
            </li>
          ))}
        </ul>
      )}
      {p.canUpload && (
        <>
          <p>{t("pay.accounts")}</p>
          <dl className={styles.accounts}>
            {p.accounts.map((a) => (
              <div key={a.method}>
                <dt>{t(`pay.method.${a.method}`)}</dt>
                {a.lines.map((line) => (
                  <dd key={line}>{line}</dd>
                ))}
              </div>
            ))}
          </dl>
          <form action={uploadAction} className={styles.form}>
            <label>
              {t("pay.upload.method")}
              <select name="method" required>
                {p.accounts.map((a) => (
                  <option key={a.method} value={a.method}>
                    {t(`pay.method.${a.method}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("pay.upload.amount")}
              <input name="amount" inputMode="decimal" required defaultValue={due > 0 ? rupeesInput(due) : ""} />
            </label>
            <label>
              {t("pay.upload.file")}
              <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required />
            </label>
            <div>
              <button className="pill">{t("pay.upload.submit")}</button>
            </div>
          </form>
        </>
      )}
      {p.online && (
        <form action={payOnlineAction}>
          <button className="pill">{t("pay.online")}</button>
        </form>
      )}
    </section>
  );
}
