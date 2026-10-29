import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "@/ui/i18n";

const { ReasonForm } = await import("@/modules/booking/ui/ConfirmForm");

const html = (paidPaisa?: number | null) =>
  renderToStaticMarkup(<ReasonForm bookingId="b1" kind="cancel" paidPaisa={paidPaisa} action={async () => null} />);

describe("ReasonForm cancel", () => {
  it("shows the refund choice when money is paid, or when the paid amount is unknown", () => {
    expect(html(500_000)).toContain(t("bookings.cancel.refundDue"));
    expect(html(null)).toContain(t("bookings.cancel.moneyUnknown"));
    expect(html(null)).toContain(t("bookings.cancel.keep"));
  });

  it("shows no choice when nothing is paid", () => {
    expect(html(0)).not.toContain(t("bookings.cancel.refundDue"));
    expect(html()).not.toContain(t("bookings.cancel.refundDue"));
  });
});
