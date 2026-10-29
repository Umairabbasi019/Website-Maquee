"use server";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/modules/access";
import { checkOnlineStatus, recordPayment, rejectPayment, setPaymentTerms, verifyPayment, type PaymentResult } from "@/modules/payments";
import { getDashboard } from "../context";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

// Plain-form actions for the booking's ledger. The venue only ever comes from the dashboard session; the booking and
// payment ids from the form are looked up inside this venue by the payments module, so another venue's id finds
// nothing. Each module function checks its permission (ForbiddenError becomes "forbidden"). An answer goes back to the
// booking page by redirect, as in actions.ts: an error as ?payErr=, a success as the page itself.
async function back(fd: FormData, fn: (tenantId: string) => Promise<PaymentResult>): Promise<never> {
  const { venue } = await getDashboard();
  let result: PaymentResult = { error: "forbidden" };
  if (venue) {
    try {
      result = await fn(venue.id);
    } catch (e) {
      if (!(e instanceof ForbiddenError)) throw e;
    }
  }
  redirect(`/dashboard/bookings/${encodeURIComponent(text(fd, "id"))}${"error" in result ? `?payErr=${result.error}` : ""}`);
}

export async function verifyPaymentAction(fd: FormData) {
  return back(fd, (tenantId) => verifyPayment(tenantId, text(fd, "paymentId"), text(fd, "amount")));
}

export async function rejectPaymentAction(fd: FormData) {
  return back(fd, (tenantId) => rejectPayment(tenantId, text(fd, "paymentId"), text(fd, "reason")));
}

export async function checkOnlineAction(fd: FormData) {
  return back(fd, (tenantId) => checkOnlineStatus(tenantId, text(fd, "paymentId")));
}

export async function recordPaymentAction(fd: FormData) {
  const kind = text(fd, "kind");
  return back(fd, (tenantId) =>
    recordPayment(tenantId, text(fd, "id"), {
      kind: kind as "payment" | "refund", // checked by the module's schema
      method: text(fd, "method"),
      amountRupees: text(fd, "amount"),
      note: text(fd, "note"),
    }),
  );
}

export async function paymentTermsAction(fd: FormData) {
  return back(fd, (tenantId) => setPaymentTerms(tenantId, text(fd, "id"), { advanceDueOn: text(fd, "advanceDueOn"), payLater: fd.get("payLater") === "on" }));
}
