import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createServiceClient, recordAuditAfterCommit, requirePerm } from "@/modules/access";
import { check } from "@/modules/booking";
import { MoneyRulesSchema, readTenantSecret } from "@/modules/tenants";
import { summarise } from "../ledger";
import { availableProvider, getProvider, type ProviderEvent } from "../providers";
import { SIGNATURE_HEADER, signSandbox } from "../providers/sandbox";
import { callSql, fail, inTenant, refusal, Uuid, type PaymentResult } from "./staff";

// Online payment: start one, take the provider's webhook, check a stuck one, and the sandbox checkout.
// Only a verified provider event (or a status check) moves an online payment to verified; a redirect never does.

// A booking can take money while it is held or confirmed. A refund-pending one already has its money.
const PAYABLE = ["confirmed", "awaiting_advance", "hold_expired"];
const Outcome = z.enum(["paid", "failed"]);

const db = createServiceClient;

async function currencyOf(tenantId: string): Promise<string> {
  return check(await db().from("tenants").select("currency").eq("id", tenantId).single<{ currency: string }>(), "tenants").currency;
}

/** Online payment is on when the venue allows the gateway method and has saved its key. */
async function onlineEnabled(tenantId: string): Promise<boolean> {
  const row = check(
    await db().from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).maybeSingle<{ money_rules: unknown }>(),
    "tenant_settings",
  );
  return !!row && MoneyRulesSchema.parse(row.money_rules).paymentMethods.includes("gateway") && (await readTenantSecret(tenantId, "payments")) !== null;
}

/** What to ask for: the rest of the advance, or the balance once the advance is met. A word when the booking cannot take money. */
async function amountDue(tenantId: string, bookingId: string): Promise<number | "state" | "amount"> {
  if (!Uuid.safeParse(bookingId).success) return "state";
  const booking = check(
    await db().from("bookings").select("status, current_quote_id").eq("tenant_id", tenantId).eq("id", bookingId).maybeSingle<{ status: string; current_quote_id: string | null }>(),
    "bookings",
  );
  if (!booking?.current_quote_id || !PAYABLE.includes(booking.status)) return "state";
  const quote = check(
    await db().from("quotes").select("total_paisa, advance_paisa").eq("tenant_id", tenantId).eq("id", booking.current_quote_id).single<{ total_paisa: number; advance_paisa: number }>(),
    "quotes",
  );
  const rows = check(
    await db().from("payments").select("kind, status, amount_paisa").eq("tenant_id", tenantId).eq("booking_id", bookingId).returns<{ kind: "payment" | "refund"; status: "pending" | "verified" | "rejected"; amount_paisa: number }[]>(),
    "payments",
  );
  const s = summarise(quote.total_paisa, quote.advance_paisa, rows.map((r) => ({ kind: r.kind, status: r.status, amountPaisa: r.amount_paisa })));
  const due = s.advanceMet ? s.balancePaisa : s.advancePaisa - s.paidPaisa;
  return due > 0 ? due : "amount";
}

/**
 * Starts an online payment for a booking and returns where to send the customer. `tenantId` comes from the host, never the browser.
 * The merchant reference is made first and the pending row saved with it, then the provider hears of it.
 */
export async function startOnlinePayment(
  tenantId: string,
  bookingId: string,
  returnUrl: string,
): Promise<{ redirectUrl: string } | { error: "off" | "state" | "amount" }> {
  const provider = availableProvider();
  if (!provider || !(await onlineEnabled(tenantId))) return { error: "off" };
  const due = await amountDue(tenantId, bookingId);
  if (typeof due === "string") return { error: due };
  const providerRef = provider.newRef();
  const { data, error } = await callSql("record_payment", {
    p_booking: bookingId,
    p_kind: "payment",
    p_method: "online",
    p_amount: due,
    p_source: "provider",
    p_note: null,
    p_receipt_path: null,
    p_provider: provider.id,
    p_provider_ref: providerRef,
    p_actor: null,
  });
  if (error) {
    const f = refusal(error);
    return f?.error === "state" || f?.error === "amount" ? { error: f.error } : fail("record_payment", error);
  }
  // If createPayment throws, the pending row stays: the "online payment pending" alert lists it after 1 hour.
  return provider.createPayment({ paymentId: String(data), providerRef, amountPaisa: due, currency: await currencyOf(tenantId), returnUrl });
}

async function applyEvent(provider: string, e: ProviderEvent, payload: object): Promise<string> {
  const { data, error } = await callSql("apply_provider_event", {
    p_provider: provider,
    p_event_id: e.eventId,
    p_provider_ref: e.providerRef,
    p_status: e.status,
    p_amount: e.amountPaisa,
    p_currency: e.currency,
    p_payload: payload,
  });
  return error ? fail("apply_provider_event", error) : String(data);
}

async function paymentByRef(provider: string, ref: string) {
  return check(
    await db().from("payments").select("tenant_id, amount_paisa").eq("provider", provider).eq("provider_ref", ref).maybeSingle<{ tenant_id: string; amount_paisa: number }>(),
    "payments",
  );
}

/**
 * A provider's delivery, from the route's raw body. The venue is found from the payment row (the gateway sends no tenant),
 * its saved key checks the signature, and only then is the event applied. Duplicates and mismatches answer 200 so the gateway stops retrying.
 */
export async function handleWebhook(providerId: string, rawBody: string, headers: Headers): Promise<{ status: 200 | 400 | 404; result?: string }> {
  const provider = getProvider(providerId);
  if (!provider) return { status: 404 };
  const ref = provider.peekRef(rawBody);
  const payment = ref && (await paymentByRef(provider.id, ref));
  const secret = payment && (await readTenantSecret(payment.tenant_id, "payments"));
  const event = secret ? provider.verifyWebhook(rawBody, headers, secret) : null;
  // The key was chosen by the ref peeked before verifying; the signed event must be for that same payment.
  if (!event || event.providerRef !== ref) return { status: 400 };
  return { status: 200, result: await applyEvent(provider.id, event, event) };
}

/** Asks the provider what happened to an online payment and applies the answer. Staff with payments.verify only. */
export async function checkOnlineStatus(tenantId: string, paymentId: string): Promise<PaymentResult> {
  await requirePerm(tenantId, "payments.verify");
  if (!Uuid.safeParse(paymentId).success) return { error: "invalid" };
  const row = await inTenant("payments", tenantId, paymentId, "amount_paisa, provider, provider_ref");
  if (!row) return { error: "notFound" };
  const provider = typeof row.provider === "string" ? getProvider(row.provider) : null;
  const ref = row.provider_ref;
  const secret = await readTenantSecret(tenantId, "payments");
  if (!provider || typeof ref !== "string" || secret === null) return { error: "state" };
  // shortcut: getStatus is status-only so amount/currency mismatch cannot be detected on this path; widen getStatus to return amount+currency when the first real adapter lands
  const status = await provider.getStatus(ref, secret);
  if (status === "pending") return { ok: true };
  const result = await applyEvent(
    provider.id,
    { eventId: `status:${ref}:${status}`, providerRef: ref, status, amountPaisa: Number(row.amount_paisa), currency: await currencyOf(tenantId) },
    { source: "status check" },
  );
  await recordAuditAfterCommit({ tenantId, action: "payment.check_status", entity: "payment", entityId: paymentId, after: { status, result } });
  return { ok: true };
}

/** The sandbox checkout page's data, or null (page 404) when the sandbox is off or the reference is unknown. */
export async function sandboxCheckout(ref: string): Promise<{ amountPaisa: number } | null> {
  const provider = getProvider("sandbox");
  const payment = provider && (await paymentByRef(provider.id, ref));
  return payment ? { amountPaisa: payment.amount_paisa } : null;
}

/**
 * A click on the sandbox checkout. It signs the event with the venue's key and hands it to handleWebhook in this process:
 * the same code the route runs, with no HTTP call back to our own host. False when the sandbox is off or the reference is unknown.
 */
export async function completeSandbox(ref: string, outcome: "paid" | "failed"): Promise<boolean> {
  const provider = getProvider("sandbox");
  const status = Outcome.safeParse(outcome);
  const payment = provider && status.success ? await paymentByRef(provider.id, ref) : null;
  const secret = payment && (await readTenantSecret(payment.tenant_id, "payments"));
  if (!provider || !status.success || !payment || !secret) return false;
  const body = JSON.stringify({
    eventId: `sbx_evt_${randomBytes(12).toString("base64url")}`,
    providerRef: ref,
    status: status.data,
    amountPaisa: payment.amount_paisa,
    currency: await currencyOf(payment.tenant_id),
  });
  const headers = new Headers({ [SIGNATURE_HEADER]: signSandbox(body, secret) });
  return (await handleWebhook(provider.id, body, headers)).status === 200;
}
