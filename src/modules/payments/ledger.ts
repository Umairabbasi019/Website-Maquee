export type PaymentRow = {
  id: string;
  kind: "payment" | "refund";
  method: "bank" | "jazzcash" | "easypaisa" | "cash" | "online";
  amountPaisa: number;
  status: "pending" | "verified" | "rejected";
  source: "customer_receipt" | "staff" | "provider";
  note: string | null;
  rejectReason: string | null;
  hasReceipt: boolean;
  providerRef: string | null;
  recordedBy: string | null;
  verifiedBy: string | null;
  createdAt: string;
};

export type LedgerSummary = {
  totalPaisa: number;
  advancePaisa: number;
  /** Verified payments minus verified refunds, shown as 0 at the least. */
  paidPaisa: number;
  /** Negative when the booking is overpaid (a provider payment is always verified, even after staff money lowered the balance). */
  balancePaisa: number;
  advanceMet: boolean;
};

export type PaymentState = "advanceDue" | "advanceOverdue" | "advancePaid" | "balanceDue" | "fullyPaid" | "paysLater";

/** Paid = verified payments - verified refunds, derived on every read and never stored. */
export function summarise(totalPaisa: number, advancePaisa: number, rows: Pick<PaymentRow, "kind" | "status" | "amountPaisa">[]): LedgerSummary {
  const net = rows.reduce((sum, r) => (r.status === "verified" ? sum + (r.kind === "payment" ? r.amountPaisa : -r.amountPaisa) : sum), 0);
  const paidPaisa = Math.max(0, net);
  return { totalPaisa, advancePaisa, paidPaisa, balancePaisa: totalPaisa - paidPaisa, advanceMet: paidPaisa >= advancePaisa };
}

/**
 * The label for a confirmed booking's money. `today` and `advanceDueOn` are venue dates (YYYY-MM-DD); the due day itself is
 * not yet overdue. Once the advance is met, "advancePaid" holds until money beyond it arrives, then "balanceDue".
 */
export function paymentState(s: LedgerSummary, b: { advanceDueOn: string | null; payLater: boolean }, today: string): PaymentState {
  if (s.balancePaisa <= 0) return "fullyPaid";
  if (s.advanceMet) return s.paidPaisa > s.advancePaisa ? "balanceDue" : "advancePaid";
  if (b.payLater) return "paysLater";
  return b.advanceDueOn !== null && b.advanceDueOn < today ? "advanceOverdue" : "advanceDue";
}
