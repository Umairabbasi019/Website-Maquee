import { describe, expect, it } from "vitest";
import { applyOverride, pickDatePrice, priceQuote, roundHalfUpToRupee, type PriceInput } from "@/modules/booking";

const base: PriceInput = {
  guests: 250,
  pkg: { name: "Gold", pricePerGuestPaisa: 320000 },
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
      ...base, taxPercent: 16, pkg: { name: "P", pricePerGuestPaisa: 1001 },
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
