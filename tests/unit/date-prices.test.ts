import { describe, expect, it } from "vitest";
import { DatePriceSchema } from "@/modules/calendar";

const ok = { startsOn: "2026-12-01", endsOn: "2026-12-01", eventTypeId: null, kind: "percent", value: -10, label: "Winter" };

describe("DatePriceSchema", () => {
  it("accepts a one-day range with a negative percent", () => {
    expect(DatePriceSchema.safeParse(ok).success).toBe(true);
  });
  it("accepts a per-guest amount and an event type", () => {
    const row = { ...ok, kind: "per_guest", value: 50000, eventTypeId: "6f1c1b9e-3f0a-4d0e-8a57-2d5f0a1b2c3d" };
    expect(DatePriceSchema.safeParse(row).success).toBe(true);
  });
  it.each([
    ["end before start", { endsOn: "2026-11-30" }],
    ["zero value", { value: 0 }],
    ["percent over 300", { value: 400 }],
    ["percent under -90", { value: -91 }],
    ["fractional value", { value: 1.5 }],
    ["61-char label", { label: "x".repeat(61) }],
    ["empty label", { label: "" }],
    ["bad date", { startsOn: "01/12/2026" }],
  ])("refuses %s", (_name, patch) => {
    expect(DatePriceSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});
