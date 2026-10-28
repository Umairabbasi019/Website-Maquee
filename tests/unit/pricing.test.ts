import { describe, expect, it } from "vitest";
import { applyOverride, customerQuote, pickDatePrice, priceQuote, quoteOverride, roundHalfUpToRupee, type PriceInput, type QuoteSnapshot } from "@/modules/booking";

const base: PriceInput = {
  guests: 250,
  pkg: { name: "Gold", pricePerGuestPaisa: 320000, minGuests: 100 },
  addons: [],
  hall: null,
  datePrice: null,
  taxPercent: 0,
  advancePercent: 50,
};

describe("roundHalfUpToRupee", () => {
  it("rounds half up, away from zero for negatives", () => {
    expect(roundHalfUpToRupee(150)).toBe(200);
    expect(roundHalfUpToRupee(149)).toBe(100);
    expect(roundHalfUpToRupee(-150)).toBe(-200);
  });
});

describe("priceQuote", () => {
  it("bills the package for its minimum guests, but per-guest add-ons for the real count", () => {
    const q = priceQuote({
      ...base,
      guests: 50,
      pkg: { name: "Gold", pricePerGuestPaisa: 320000, minGuests: 300 },
      addons: [{ name: "Mehndi", pricePaisa: 10000, basis: "per_guest" }],
    });
    expect(q.lines).toEqual([
      { kind: "package", label: "Gold (billed for 300 guests, package minimum)", amountPaisa: 96000000 },
      { kind: "addon", label: "Mehndi", amountPaisa: 500000 },
    ]);
    expect(q.totalPaisa).toBe(96500000);
  });
  it("bills the real count at or above the minimum, with the plain label", () => {
    const q = priceQuote({ ...base, guests: 300, pkg: { name: "Gold", pricePerGuestPaisa: 320000, minGuests: 300 } });
    expect(q.lines).toEqual([{ kind: "package", label: "Gold", amountPaisa: 96000000 }]);
  });
  it("prices a package with advance", () => {
    const q = priceQuote(base);
    expect(q.totalPaisa).toBe(80000000);
    expect(q.advancePaisa).toBe(40000000);
    expect(q.lines).toEqual([{ kind: "package", label: "Gold", amountPaisa: 80000000 }]);
  });
  it("prices add-ons per guest and flat", () => {
    const q = priceQuote({
      ...base, pkg: null,
      addons: [
        { name: "Chairs", pricePaisa: 5000, basis: "per_guest" },
        { name: "Stage", pricePaisa: 2000000, basis: "flat" },
      ],
    });
    expect(q.lines.map((l) => l.amountPaisa)).toEqual([1250000, 2000000]);
  });
  it("applies percent and per-guest date prices", () => {
    const pct = priceQuote({ ...base, datePrice: { label: "Off", kind: "percent", value: -10 } });
    expect(pct.lines.find((l) => l.kind === "date")?.amountPaisa).toBe(-8000000);
    expect(pct.totalPaisa).toBe(72000000);
    const pg = priceQuote({ ...base, datePrice: { label: "Peak", kind: "per_guest", value: 10000 } });
    expect(pg.lines.find((l) => l.kind === "date")?.amountPaisa).toBe(2500000);
  });
  it("taxes subtotal plus date line, rounded once", () => {
    const q = priceQuote({
      ...base, taxPercent: 16, pkg: { name: "P", pricePerGuestPaisa: 1001, minGuests: 1 },
      datePrice: { label: "Peak", kind: "per_guest", value: 1 },
    });
    // 250500 * 16% = 40080 -> 40100
    expect(q.subtotalPaisa).toBe(250500);
    expect(q.taxPaisa).toBe(40100);
    expect(q.lines.find((l) => l.kind === "tax")?.amountPaisa).toBe(q.taxPaisa);
    expect(q.totalPaisa).toBe(250500 + 40100);
  });
  it("hall null price adds a zero line; null hall adds none", () => {
    const withHall = priceQuote({ ...base, hall: { name: "Main", hirePricePaisa: null } });
    expect(withHall.lines[0]).toEqual({ kind: "hall", label: "Main", amountPaisa: 0 });
    expect(priceQuote(base).lines.some((l) => l.kind === "hall")).toBe(false);
  });
  it("no package line when pkg is null", () => {
    expect(priceQuote({ ...base, pkg: null }).lines.some((l) => l.kind === "package")).toBe(false);
  });
});

describe("applyOverride", () => {
  it("fixes total, derives tax inside it", () => {
    const q = priceQuote({ ...base, taxPercent: 16 });
    const o = applyOverride(q, 70000000, 16, 50);
    expect(o.totalPaisa).toBe(70000000);
    expect(o.taxPaisa).toBe(roundHalfUpToRupee((70000000 * 16) / 116));
    expect(o.subtotalPaisa).toBe(70000000 - o.taxPaisa);
    expect(o.advancePaisa).toBe(roundHalfUpToRupee(35000000));
    expect(o.calculatedTotalPaisa).toBe(q.totalPaisa);
    expect(o.lines).toEqual(q.lines);
  });
});

describe("pickDatePrice", () => {
  it("prefers the event-specific row", () => {
    const all = { eventTypeId: null, v: 1 };
    const one = { eventTypeId: "e1", v: 2 };
    expect(pickDatePrice([all, one], "e1")).toBe(one);
    expect(pickDatePrice([all, one], "e2")).toBe(all);
    expect(pickDatePrice([], "e1")).toBeNull();
  });
});

describe("customerQuote and quoteOverride", () => {
  const lines = [{ kind: "package" as const, label: "Gold", amountPaisa: 25_000_000 }];
  const snap = (finalTotalPaisa: number, overrideReason: string | null): QuoteSnapshot => ({
    lines,
    subtotalPaisa: finalTotalPaisa,
    taxPaisa: 0,
    advancePaisa: finalTotalPaisa / 2,
    calculatedTotalPaisa: 25_000_000,
    finalTotalPaisa,
    overrideReason,
    inputs: { guests: 250, pkg: null, addons: [], hall: null, datePrice: null, taxPercent: 0, advancePercent: 50 },
  });

  it("keeps the lines when the total is the calculated one, with no override for staff", () => {
    expect(customerQuote(snap(25_000_000, null), 25_000_000, 12_500_000).lines).toEqual(lines);
    expect(quoteOverride(snap(25_000_000, null))).toBeNull();
  });

  it("drops the lines for the customer after an override, and gives staff the calculated total and reason", () => {
    const q = customerQuote(snap(70_000_000, "Agreed"), 70_000_000, 35_000_000);
    expect(q).toEqual({ lines: [], subtotalPaisa: 70_000_000, taxPaisa: 0, totalPaisa: 70_000_000, advancePaisa: 35_000_000 });
    expect(JSON.stringify(q)).not.toContain("Agreed");
    expect(quoteOverride(snap(70_000_000, "Agreed"))).toEqual({ calculatedPaisa: 25_000_000, reason: "Agreed" });
  });
});
