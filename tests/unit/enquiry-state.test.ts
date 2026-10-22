import { describe, expect, it } from "vitest";
import { enquiryReducer } from "@/sections/shared/enquiry-state";

const gold = { eventSlug: "barat", name: "Gold", pricePerGuestPaisa: 420000, minGuests: 300 };
const start = { eventSlug: null, pick: null, guests: 400 };

describe("enquiryReducer", () => {
  it("keeps the guests the form shows when they already meet the package minimum", () => {
    const s = enquiryReducer(start, { type: "package", pick: gold });
    expect(s).toEqual({ eventSlug: "barat", pick: gold, guests: 400 });
  });

  it("raises the guests the form shows to the package minimum", () => {
    const at200 = enquiryReducer(start, { type: "guests", guests: 200 });
    expect(enquiryReducer(at200, { type: "package", pick: gold }).guests).toBe(300);
  });

  it("keeps the pick when the event changes, so the form can drop it while the events differ", () => {
    const s = enquiryReducer(enquiryReducer(start, { type: "package", pick: gold }), { type: "event", slug: "valima" });
    expect(s).toEqual({ eventSlug: "valima", pick: gold, guests: 400 });
  });
});
