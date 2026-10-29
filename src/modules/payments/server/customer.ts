import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/modules/access";
import { check, resolveBookingToken } from "@/modules/booking";
import { checkImage } from "@/modules/media";
import { MoneyRulesSchema } from "@/modules/tenants";
import { parseRupees } from "@/sections/shared/format";
import { customerPayments, type CustomerPayments } from "../customer-view";
import { onlineEnabled } from "./online";
import { callSql, fail, inTenant, refusal } from "./staff";

// The customer's side of a payment, behind the private booking link. `tenantId` is the host's venue, never the browser's.

const BUCKET = "payment-receipts";
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const EXT = { jpeg: "jpg", png: "png", webp: "webp" } as const;

type UploadError = "invalid" | "type" | "tooLarge" | "amount" | "limit" | "state";
type DbRow = {
  id: string;
  kind: "payment" | "refund";
  method: CustomerPayments["rows"][number]["method"];
  amount_paisa: number;
  status: "pending" | "verified" | "rejected";
  reject_reason: string | null;
  created_at: string;
};

/** A booking's money as the customer sees it; null while the booking is a request, declined or expired. */
export async function getCustomerPayments(tenantId: string, bookingId: string): Promise<CustomerPayments | null> {
  const booking = await inTenant("bookings", tenantId, bookingId, "status, current_quote_id");
  if (!booking || typeof booking.current_quote_id !== "string") return null;
  const db = createServiceClient();
  const [quote, rows, settings, online] = await Promise.all([
    db.from("quotes").select("total_paisa, advance_paisa").eq("tenant_id", tenantId).eq("id", booking.current_quote_id).single<{ total_paisa: number; advance_paisa: number }>(),
    db.from("payments").select("id, kind, method, amount_paisa, status, reject_reason, created_at").eq("tenant_id", tenantId).eq("booking_id", bookingId).order("created_at").returns<DbRow[]>(),
    db.from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).maybeSingle<{ money_rules: unknown }>(),
    onlineEnabled(tenantId),
  ]);
  const q = check(quote, "quotes");
  const rules = MoneyRulesSchema.parse(check(settings, "tenant_settings")?.money_rules ?? {});
  return customerPayments({
    status: String(booking.status),
    totalPaisa: q.total_paisa,
    advancePaisa: q.advance_paisa,
    rows: check(rows, "payments").map((r) => ({
      id: r.id,
      kind: r.kind,
      method: r.method,
      amountPaisa: r.amount_paisa,
      status: r.status,
      rejectReason: r.reject_reason,
      createdAt: r.created_at,
    })),
    methods: rules.paymentMethods,
    accounts: rules.paymentAccounts,
    onlineEnabled: online,
  });
}

/**
 * Saves a receipt photo as a pending payment for staff to check. The row is made first so a refusal (too many receipts, too much money)
 * never leaves a file behind; if the file then fails to store, the row is removed again.
 */
export async function uploadReceipt(tenantId: string, token: string, fd: FormData): Promise<{ ok: true } | { error: UploadError }> {
  const access = await resolveBookingToken(token, tenantId);
  const file = fd.get("receipt");
  const amount = parseRupees(String(fd.get("amount") ?? ""));
  if (!access || amount === null || !(file instanceof File)) return { error: "invalid" };
  const current = await getCustomerPayments(tenantId, access.bookingId);
  if (!current?.canUpload) return { error: "state" };
  const method = current.accounts.find((a) => a.method === fd.get("method"))?.method;
  if (!method) return { error: "invalid" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = await checkImage(bytes, MAX_RECEIPT_BYTES);
  if ("error" in image) return { error: image.error === "tooLarge" ? "tooLarge" : "type" };
  const format = image.meta.format as keyof typeof EXT;
  const path = `${tenantId}/${access.bookingId}/${randomUUID()}.${EXT[format]}`;
  const { data, error } = await callSql("record_payment", {
    p_booking: access.bookingId,
    p_kind: "payment",
    p_method: method,
    p_amount: amount,
    p_source: "customer_receipt",
    p_note: null,
    p_receipt_path: path,
    p_provider: null,
    p_provider_ref: null,
    p_actor: null,
  });
  if (error) {
    const known = refusal(error);
    if (!known) return fail("record_payment", error);
    return { error: known.error === "amount" || known.error === "limit" || known.error === "state" ? known.error : "invalid" };
  }
  const db = createServiceClient();
  let stored = false;
  try {
    stored = !(await db.storage.from(BUCKET).upload(path, bytes, { contentType: `image/${format}` })).error;
  } catch {
    // A thrown upload is rolled back like a refused one.
  }
  if (stored) return { ok: true };
  const removed = await db.from("payments").delete().eq("id", String(data));
  // A row left behind with no file would show the customer a receipt nobody can open.
  if (removed.error) throw new Error(`receipt rollback: ${removed.error.message}`);
  return { error: "invalid" };
}
