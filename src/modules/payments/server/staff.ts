import "server-only";
import { z } from "zod";
import { createServerClient, createServiceClient, recordAuditAfterCommit, requirePerm } from "@/modules/access";
import { check } from "@/modules/booking";
import { parseRupees } from "@/sections/shared/format";
import { STAFF_METHODS, type PaymentRow } from "../ledger";

// Staff payment actions. `tenantId` always comes from getDashboard() in the calling Server Action, never from the browser.
// Reads use the session client (RLS). Writes check payments.verify here, confirm the row is this venue's, then call a
// service-role SQL function, which locks the booking and moves money and status together.

export type PaymentResult = { ok: true } | { error: "invalid" | "forbidden" | "notFound" | "state" | "amount" | "limit" };
type Failure = Extract<PaymentResult, { error: string }>;

const RAISED = "P0001";
const DEADLOCK = "40P01";
const RECEIPT_SECONDS = 300;
const BUCKET = "payment-receipts";

export const Uuid = z.uuid();
const Rupees = z.string().transform((s) => parseRupees(s)).pipe(z.number());
const RecordInput = z.object({
  kind: z.enum(["payment", "refund"]),
  method: z.enum(STAFF_METHODS),
  amountRupees: Rupees,
  note: z.string().trim().max(300).optional(),
});
const Reason = z.string().trim().min(3).max(300);
const Terms = z.object({ advanceDueOn: z.iso.date(), payLater: z.boolean() });

const SQL_ERRORS: Record<string, Failure["error"]> = {
  amount_out_of_range: "amount",
  payment_state: "state",
  receipt_limit: "limit",
  invalid_reason: "invalid",
  not_found: "notFound",
};

type RpcError = { code?: string; message: string };

/** The answer for a refused call, or undefined for an error that should be thrown. */
export const refusal = (e: RpcError): Failure | undefined => {
  const error = e.code === RAISED ? SQL_ERRORS[e.message] : undefined;
  return error && { error };
};

export const fail = (fn: string, e: RpcError): never => {
  throw new Error(`${fn}: ${e.message}`);
};

/**
 * Calls a payment SQL function. Two payment actions on one booking can deadlock in rare timing; Postgres aborts one of
 * them, and running it again once is safe because the aborted call changed nothing.
 */
export async function callSql(fn: string, args: Record<string, unknown>) {
  const db = createServiceClient();
  let r = await db.rpc(fn, args);
  if (r.error?.code === DEADLOCK) r = await db.rpc(fn, args);
  return r;
}

export async function inTenant(table: "bookings" | "payments", tenantId: string, id: string, columns: string) {
  const db = createServiceClient();
  return check(await db.from(table).select(columns).eq("tenant_id", tenantId).eq("id", id).maybeSingle<Record<string, unknown>>(), table);
}

type DbPayment = {
  id: string;
  kind: PaymentRow["kind"];
  method: PaymentRow["method"];
  amount_paisa: number;
  status: PaymentRow["status"];
  source: PaymentRow["source"];
  note: string | null;
  reject_reason: string | null;
  receipt_path: string | null;
  provider_ref: string | null;
  recorded_by: string | null;
  verified_by: string | null;
  created_at: string;
};

/** A booking's ledger rows, oldest first. The receipt's file path stays on the server; only `hasReceipt` leaves. */
export async function listPayments(tenantId: string, bookingId: string): Promise<PaymentRow[]> {
  await requirePerm(tenantId, "payments.view");
  if (!Uuid.safeParse(bookingId).success) return [];
  const db = await createServerClient();
  const rows = check(
    await db
      .from("payments")
      .select("id, kind, method, amount_paisa, status, source, note, reject_reason, receipt_path, provider_ref, recorded_by, verified_by, created_at")
      .eq("tenant_id", tenantId)
      .eq("booking_id", bookingId)
      .order("created_at")
      .returns<DbPayment[]>(),
    "payments",
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    method: r.method,
    amountPaisa: r.amount_paisa,
    status: r.status,
    source: r.source,
    note: r.note,
    rejectReason: r.reject_reason,
    hasReceipt: r.receipt_path !== null,
    providerRef: r.provider_ref,
    recordedBy: r.recorded_by,
    verifiedBy: r.verified_by,
    createdAt: r.created_at,
  }));
}

/** Records a payment or refund staff took outside the site (cash, bank, wallet). It is verified at once. */
export async function recordPayment(
  tenantId: string,
  bookingId: string,
  input: { kind: "payment" | "refund"; method: string; amountRupees: string; note?: string },
): Promise<PaymentResult> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const parsed = RecordInput.safeParse(input);
  if (!parsed.success || !Uuid.safeParse(bookingId).success) return { error: "invalid" };
  if (!(await inTenant("bookings", tenantId, bookingId, "id"))) return { error: "notFound" };
  const { kind, method, amountRupees: amountPaisa, note } = parsed.data;
  const { data, error } = await callSql("record_payment", {
    p_booking: bookingId,
    p_kind: kind,
    p_method: method,
    p_amount: amountPaisa,
    p_source: "staff",
    p_note: note || null,
    p_receipt_path: null,
    p_provider: null,
    p_provider_ref: null,
    p_actor: viewer.userId,
  });
  if (error) return refusal(error) ?? fail("record_payment", error);
  await recordAuditAfterCommit({
    tenantId,
    action: "payment.record",
    entity: "payment",
    entityId: String(data),
    after: { bookingId, kind, method, amountPaisa },
  });
  return { ok: true };
}

/** Accepts a customer's receipt at the amount that actually arrived. The old and new amounts are audited. */
export async function verifyPayment(tenantId: string, paymentId: string, amountRupees: string): Promise<PaymentResult> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const amount = Rupees.safeParse(amountRupees);
  if (!amount.success || !Uuid.safeParse(paymentId).success) return { error: "invalid" };
  const before = await inTenant("payments", tenantId, paymentId, "amount_paisa, status");
  if (!before) return { error: "notFound" };
  const { error } = await callSql("verify_payment", { p_payment: paymentId, p_amount: amount.data, p_actor: viewer.userId });
  if (error) return refusal(error) ?? fail("verify_payment", error);
  await recordAuditAfterCommit({
    tenantId,
    action: "payment.verify",
    entity: "payment",
    entityId: paymentId,
    before: { status: before.status, amountPaisa: before.amount_paisa },
    after: { status: "verified", amountPaisa: amount.data },
  });
  return { ok: true };
}

/** Turns a receipt down with a reason (3 to 300 characters) the customer will see. The booking is never cancelled by this. */
export async function rejectPayment(tenantId: string, paymentId: string, reason: string): Promise<PaymentResult> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const why = Reason.safeParse(reason);
  if (!why.success || !Uuid.safeParse(paymentId).success) return { error: "invalid" };
  const before = await inTenant("payments", tenantId, paymentId, "status");
  if (!before) return { error: "notFound" };
  const { error } = await callSql("reject_payment", { p_payment: paymentId, p_reason: why.data, p_actor: viewer.userId });
  if (error) return refusal(error) ?? fail("reject_payment", error);
  await recordAuditAfterCommit({
    tenantId,
    action: "payment.reject",
    entity: "payment",
    entityId: paymentId,
    before: { status: before.status },
    after: { status: "rejected" },
    reason: why.data,
  });
  return { ok: true };
}

/** Sets the advance due date and the "pays later" mark of a confirmed booking. */
export async function setPaymentTerms(tenantId: string, bookingId: string, input: { advanceDueOn: string; payLater: boolean }): Promise<PaymentResult> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const terms = Terms.safeParse(input);
  if (!terms.success || !Uuid.safeParse(bookingId).success) return { error: "invalid" };
  const before = await inTenant("bookings", tenantId, bookingId, "advance_due_on, pay_later");
  if (!before) return { error: "notFound" };
  const { error } = await callSql("set_payment_terms", {
    p_booking: bookingId,
    p_advance_due_on: terms.data.advanceDueOn,
    p_pay_later: terms.data.payLater,
    p_actor: viewer.userId,
  });
  if (error) return refusal(error) ?? fail("set_payment_terms", error);
  await recordAuditAfterCommit({
    tenantId,
    action: "booking.payment_terms",
    entity: "booking",
    entityId: bookingId,
    before: { advanceDueOn: before.advance_due_on, payLater: before.pay_later },
    after: terms.data,
  });
  return { ok: true };
}

/** A link to a receipt image that works for 5 minutes, or null when the payment has none. */
export async function receiptUrl(tenantId: string, paymentId: string): Promise<string | null> {
  await requirePerm(tenantId, "payments.view");
  if (!Uuid.safeParse(paymentId).success) return null;
  const row = await inTenant("payments", tenantId, paymentId, "receipt_path");
  const path = row?.receipt_path;
  if (typeof path !== "string") return null;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUrl(path, RECEIPT_SECONDS);
  if (error) throw new Error(`receipt url: ${error.message}`);
  return data.signedUrl;
}
