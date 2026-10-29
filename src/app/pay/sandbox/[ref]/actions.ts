"use server";
import { notFound, redirect } from "next/navigation";
import { completeSandbox } from "@/modules/payments";

/** The Pay and Fail buttons. The reference alone finds the payment; the venue comes from its row, never the browser. */
export async function settleSandbox(ref: string, fd: FormData) {
  const outcome = fd.get("outcome");
  if (!(outcome === "paid" || outcome === "failed") || !(await completeSandbox(ref, outcome))) notFound();
  redirect(`/pay/sandbox/${encodeURIComponent(ref)}?done=1`);
}
