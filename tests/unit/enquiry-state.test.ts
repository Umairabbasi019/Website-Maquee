import { describe, expect, it } from "vitest";
import { enquiryReducer } from "@/sections/shared/enquiry-state";

const gold = { eventSlug: "barat", name: "Gold", pricePerGuestPaisa: 420000, minGuests: 300 };
const start = { eventSlug: null, pick: null, guests: 400 };

describe("enquiryReducer", () => {
  it("keeps the guests the form shows when they already meet the package minimum", () => {
    const s = enquiryReducer(start, { type: "package", pick: gold, maxGuests: 1000 });
    expect(s).toEqual({ eventSlug: "barat", pick: gold, guests: 400 });
  });

  it("raises the guests the form shows to the package minimum", () => {
    const at200 = enquiryReducer(start, { type: "guests", guests: 200 });
    expect(enquiryReducer(at200, { type: "package", pick: gold, maxGuests: 1000 }).guests).toBe(300);
  });

  it("caps the raised guests at the form range maximum", () => {
    const big = { ...gold, minGuests: 1500 };
    expect(enquiryReducer(start, { type: "package", pick: big, maxGuests: 1000 }).guests).toBe(1000);
  });

  it("keeps the pick when the event changes, so the form can drop it while the events differ", () => {
    const s = enquiryReducer(enquiryReducer(start, { type: "package", pick: gold, maxGuests: 1000 }), { type: "event", slug: "valima" });
    expect(s).toEqual({ eventSlug: "valima", pick: gold, guests: 400 });
  });
});
