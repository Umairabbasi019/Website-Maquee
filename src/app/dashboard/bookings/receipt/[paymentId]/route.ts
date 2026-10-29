import { NextResponse } from "next/server";
import { ForbiddenError } from "@/modules/access";
import { receiptUrl } from "@/modules/payments";
import { getDashboard } from "../../../context";

/**
 * Opens a receipt: the 5-minute signed link is made on each visit and the browser is sent to it, so no link is stored
 * on the page. The venue comes from the dashboard session; the payment id is looked up inside it by receiptUrl.
 * A plain link (not a form) so it opens in a new tab with or without JavaScript.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { venue } = await getDashboard();
  if (!venue) return new Response(null, { status: 404 });
  try {
    const url = await receiptUrl(venue.id, (await params).paymentId);
    return url ? NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 404 });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw e;
  }
}
