"use server";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/modules/access";
import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  previewQuote,
  type ConfirmFormState,
  type QuotePreview,
  type ReasonFormState,
} from "@/modules/booking";
import { getDashboard } from "../context";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

// The venue only ever comes from the dashboard session. The booking and hall ids from the form are looked up inside
// this venue by the booking module, so another venue's id finds nothing. requirePerm throws ForbiddenError.
async function inVenue<T>(fn: (tenantId: string) => Promise<T>, forbidden: T): Promise<T> {
  const { venue } = await getDashboard();
  if (!venue) return forbidden;
  try {
    return await fn(venue.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden;
    throw e;
  }
}

/** The confirm form's quote for another hall, as the select changes. */
export async function previewAction(bookingId: string, hallId: string): Promise<QuotePreview | null> {
  return inVenue((tenantId) => previewQuote(tenantId, bookingId, hallId), null);
}

export async function confirmAction(_prev: ConfirmFormState, fd: FormData): Promise<ConfirmFormState> {
  const id = text(fd, "id");
  const values = { hallId: text(fd, "hallId"), finalTotalRupees: text(fd, "finalTotalRupees"), reason: text(fd, "reason") };
  // Without JavaScript, "Update quote" reloads the page with the chosen hall (only its id goes in the URL). A redirect
  // rather than a returned state: Next 16.4 fails to re-render a dashboard page after a no-JS action that returns state
  // (cookies invariant in createServerClient).
  if (fd.get("intent") === "preview") redirect(`/dashboard/bookings/${encodeURIComponent(id)}?hall=${encodeURIComponent(values.hallId)}`);
  const state = await inVenue<ConfirmFormState | "confirmed">(
    async (tenantId) => {
      // An empty total means the calculated one, so it is not sent at all.
      const r = await confirmBooking(tenantId, id, {
        hallId: values.hallId,
        finalTotalRupees: values.finalTotalRupees || undefined,
        reason: values.reason || undefined,
        previewedTotalPaisa: text(fd, "previewedTotalPaisa"),
      });
      if ("ok" in r) return "confirmed";
      return { error: r.error, values, preview: await previewQuote(tenantId, id, values.hallId) };
    },
    { error: "forbidden", values, preview: null },
  );
  if (state === "confirmed") redirect(`/dashboard/bookings/${id}`);
  return state;
}

async function reasonAction(fd: FormData, fn: typeof declineBooking): Promise<ReasonFormState> {
  const id = text(fd, "id");
  const reason = text(fd, "reason");
  const r = await inVenue((tenantId) => fn(tenantId, id, reason), { error: "forbidden" as const });
  if ("ok" in r) redirect(`/dashboard/bookings/${id}`);
  return { error: r.error, reason };
}

export async function declineAction(_prev: ReasonFormState, fd: FormData): Promise<ReasonFormState> {
  return reasonAction(fd, declineBooking);
}

export async function cancelAction(_prev: ReasonFormState, fd: FormData): Promise<ReasonFormState> {
  // Only "true" or "false" is a choice; anything else is none, which a booking with money paid refuses.
  const choice = fd.get("refundDue");
  const refundDue = choice === "true" ? true : choice === "false" ? false : undefined;
  return reasonAction(fd, (tenantId, id, reason) => cancelBooking(tenantId, id, reason, refundDue));
}
