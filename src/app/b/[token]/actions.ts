"use server";
import { redirect } from "next/navigation";
import { resolveBookingToken } from "@/modules/booking";
import { startOnlinePayment, uploadReceipt } from "@/modules/payments";
import { hostTenant } from "../../book/host";

// Both actions take the venue from the host and the booking from the token; nothing else from the browser decides who pays.
// Plain redirects, so the forms work without JavaScript. The answer travels as a word in the URL and only picks a message.
const home = (token: string) => `/b/${encodeURIComponent(token)}`;

export async function uploadReceiptAction(token: string, fd: FormData): Promise<void> {
  const tenantId = await hostTenant();
  const r = tenantId ? await uploadReceipt(tenantId, token, fd) : { error: "invalid" as const };
  redirect(`${home(token)}?${"ok" in r ? "sent=1" : `err=${r.error}`}`);
}

export async function payOnlineAction(token: string): Promise<void> {
  const tenantId = await hostTenant();
  const access = tenantId ? await resolveBookingToken(token, tenantId) : null;
  if (!tenantId || !access) redirect(`${home(token)}?err=state`);
  // shortcut: a relative return path works for the sandbox; a real gateway needs an absolute URL, so build one from a configured site origin then.
  const r = await startOnlinePayment(tenantId, access.bookingId, `${home(token)}?paid=1`);
  redirect("redirectUrl" in r ? r.redirectUrl : `${home(token)}?err=${r.error}`);
}
