import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sandboxCheckout } from "@/modules/payments";
import { formatRs } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { settleSandbox } from "./actions";

// Per reference, read on every request; never cached.
export const instant = false;

export const metadata: Metadata = { title: t("pay.sandbox.heading"), robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The fake gateway's checkout. It exists only while the sandbox is on; anything else is a 404. */
export default async function SandboxCheckoutPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ done?: string }> }) {
  const { ref } = await params;
  const checkout = await sandboxCheckout(ref);
  if (!checkout) notFound();
  return (
    <main>
      <h1>{t("pay.sandbox.heading")}</h1>
      <p>{t("pay.sandbox.note")}</p>
      {(await searchParams).done ? (
        <p role="status">{t("pay.sandbox.done")}</p>
      ) : (
        <form action={settleSandbox.bind(null, ref)}>
          <p>
            {t("pay.sandbox.amount")}: {formatRs(checkout.amountPaisa)}
          </p>
          <button name="outcome" value="paid">
            {t("pay.sandbox.pay")}
          </button>
          <button name="outcome" value="failed">
            {t("pay.sandbox.fail")}
          </button>
        </form>
      )}
    </main>
  );
}
