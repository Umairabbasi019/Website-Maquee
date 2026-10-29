import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "@/ui/i18n";

const { BookingView } = await import("@/modules/booking/ui/BookingView");
type CustomerBookingView = Parameters<typeof BookingView>[0]["view"];

const view = (status: CustomerBookingView["status"]): CustomerBookingView => ({
  id: "00000000-0000-4000-8000-000000000001",
  reference: "VE-2610-0001",
  status,
  eventDate: "2026-12-15",
  slot: "Evening",
  eventType: "Barat",
  packageName: null,
  addons: [],
  guests: 300,
  hall: null,
  quote: null,
  holdExpiresAt: null,
  advanceDueOn: null,
  venueName: "Venue",
  timeZone: "Asia/Karachi",
});

describe("BookingView", () => {
  it("says a cancelled booking was cancelled, not that the request was not confirmed", () => {
    const html = renderToStaticMarkup(<BookingView view={view("cancelled")} />);
    expect(html).toContain(t("booking.cancelled"));
    expect(html).not.toContain(t("booking.notConfirmed"));
  });

  it("keeps the not-confirmed copy for a declined request", () => {
    expect(renderToStaticMarkup(<BookingView view={view("declined")} />)).toContain(t("booking.notConfirmed"));
  });
});
