import { summarise, type LedgerSummary, type PaymentRow } from "./ledger";

type Row = Pick<PaymentRow, "id" | "method" | "amountPaisa" | "status" | "rejectReason" | "createdAt" | "kind">;

export type CustomerPayments = {
  summary: LedgerSummary;
  /** Money rows only. Who recorded or verified them, notes and provider references never leave the server. */
  rows: Row[];
  accounts: { method: "bank" | "jazzcash" | "easypaisa"; lines: string[] }[];
  /** Pay online is offered. */
  online: boolean;
  canUpload: boolean;
};

type Accounts = {
  bank?: { bankName: string; accountTitle: string; accountNumber: string };
  jazzcash?: { accountTitle: string; number: string };
  easypaisa?: { accountTitle: string; number: string };
};

type Input = {
  status: string;
  totalPaisa: number;
  advancePaisa: number;
  rows: Row[];
  methods: string[];
  accounts: Accounts;
  onlineEnabled: boolean;
  /** An expired hold whose range another booking now holds: money paid now could only be refunded. */
  slotTaken: boolean;
};

// Before a hall is held (or after the request was turned down) there is nothing to pay.
const NOTHING_TO_PAY = ["requested", "declined", "expired"];
// Statuses that can still take money. A cancelled or refunded one only shows its history.
const PAYABLE = ["awaiting_advance", "confirmed", "hold_expired"];

/** What the customer's link shows about money, or null for a booking that is not held. Only enabled methods that have details are listed. */
export function customerPayments(i: Input): CustomerPayments | null {
  if (NOTHING_TO_PAY.includes(i.status)) return null;
  const summary = summarise(i.totalPaisa, i.advancePaisa, i.rows);
  const payable = PAYABLE.includes(i.status) && !(i.status === "hold_expired" && i.slotTaken) && summary.balancePaisa > 0;
  const { bank, jazzcash, easypaisa } = i.accounts;
  const accounts = [
    ...(i.methods.includes("bank") && bank ? [{ method: "bank" as const, lines: [bank.bankName, bank.accountTitle, bank.accountNumber] }] : []),
    ...(i.methods.includes("jazzcash") && jazzcash ? [{ method: "jazzcash" as const, lines: [jazzcash.accountTitle, jazzcash.number] }] : []),
    ...(i.methods.includes("easypaisa") && easypaisa ? [{ method: "easypaisa" as const, lines: [easypaisa.accountTitle, easypaisa.number] }] : []),
  ];
  return {
    summary,
    rows: i.rows.map(({ id, method, amountPaisa, status, rejectReason, createdAt, kind }) => ({ id, method, amountPaisa, status, rejectReason, createdAt, kind })),
    accounts,
    online: payable && i.onlineEnabled,
    canUpload: payable && accounts.length > 0,
  };
}
