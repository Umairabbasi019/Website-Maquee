"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createBookingRequest,
  estimateFor,
  hashKey,
  readRequestForm,
  requestFieldErrors,
  type EstimateAction,
  type RequestFormState,
} from "@/modules/booking";
import { formatRs } from "@/sections/shared/format";
import { hostTenant } from "./host";

// shortcut: the first x-forwarded-for hop is the client only behind a proxy that sets it (Vercel does); a self-hosted
// server reachable directly lets a client choose it, so read the proxy's own header there. The per-phone limit still holds.
const clientIp = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";

/** The public request. The same answer for a free or a taken date: nothing here reads bookings. */
export async function submitBookingRequest(_prev: RequestFormState, fd: FormData): Promise<RequestFormState> {
  const values = readRequestForm(fd);
  const tenantId = await hostTenant();
  if (!tenantId) return { values, errors: [], message: "invalid" };
  const r = await createBookingRequest(tenantId, values, hashKey(clientIp(await headers())));
  if ("error" in r) return { values, errors: r.error === "invalid" ? requestFieldErrors(values) : [], message: r.error };
  // Only the token travels: the sent page reads the reference from the stored booking.
  redirect(`/book/sent?t=${r.token}`);
}

/** The live estimate. Takes the choices only; the server prices them. */
export async function estimateBooking(choices: Parameters<EstimateAction>[0]): Promise<string | null> {
  const tenantId = await hostTenant();
  const quote = tenantId && (await estimateFor(tenantId, choices));
  return quote ? formatRs(quote.totalPaisa) : null;
}
