// Pure pricing service (client-safe). Money is integer paisa.
// Rounding rule: half up to the whole rupee (100 paisa), applied once per
// computed line, never to a running total. Negatives round away from zero
// (-150 -> -200). Fractions are kept as num/den so no float drift enters paisa.

export type PriceInput = {
  guests: number;
  pkg: { name: string; pricePerGuestPaisa: number } | null;
  addons: { name: string; pricePaisa: number; basis: "flat" | "per_guest" }[];
  hall: { name: string; hirePricePaisa: number | null } | null;
  datePrice: { label: string; kind: "percent" | "per_guest"; value: number } | null;
  taxPercent: number;
  advancePercent: number;
};

export type QuoteLine = { kind: "hall" | "package" | "addon" | "date" | "tax"; label: string; amountPaisa: number };
export type Quote = { lines: QuoteLine[]; subtotalPaisa: number; taxPaisa: number; totalPaisa: number; advancePaisa: number };

// Rounds num/den paisa (den > 0) to the nearest rupee, half away from zero.
function roundFraction(num: number, den: number): number {
  const abs = Math.abs(num);
  const x = 2 * abs + 100 * den;
  const y = 200 * den;
  return Math.sign(num) * ((x - (x % y)) / y) * 100;
}

export const roundHalfUpToRupee = (paisa: number): number => roundFraction(paisa, 1);

export function priceQuote(i: PriceInput): Quote {
  const lines: QuoteLine[] = [];
  if (i.hall) lines.push({ kind: "hall", label: i.hall.name, amountPaisa: i.hall.hirePricePaisa ?? 0 });
  if (i.pkg) lines.push({ kind: "package", label: i.pkg.name, amountPaisa: i.pkg.pricePerGuestPaisa * i.guests });
  for (const a of i.addons) {
    lines.push({ kind: "addon", label: a.name, amountPaisa: a.basis === "per_guest" ? a.pricePaisa * i.guests : a.pricePaisa });
  }
  const preDate = lines.reduce((s, l) => s + l.amountPaisa, 0);
  let dateAmount = 0;
  if (i.datePrice) {
    const d = i.datePrice;
    dateAmount = d.kind === "percent" ? roundFraction(preDate * d.value, 100) : d.value * i.guests;
    lines.push({ kind: "date", label: d.label, amountPaisa: dateAmount });
  }
  const subtotalPaisa = preDate + dateAmount;
  const taxPaisa = roundFraction(subtotalPaisa * i.taxPercent, 100);
  if (taxPaisa !== 0) lines.push({ kind: "tax", label: `Tax ${i.taxPercent}%`, amountPaisa: taxPaisa });
  const totalPaisa = subtotalPaisa + taxPaisa;
  return { lines, subtotalPaisa, taxPaisa, totalPaisa, advancePaisa: roundFraction(totalPaisa * i.advancePercent, 100) };
}

// Staff override: the final total includes tax; lines stay as calculated.
export function applyOverride(
  q: Quote,
  finalTotalPaisa: number,
  taxPercent: number,
  advancePercent: number,
): Quote & { calculatedTotalPaisa: number } {
  const taxPaisa = roundFraction(finalTotalPaisa * taxPercent, 100 + taxPercent);
  return {
    lines: q.lines,
    subtotalPaisa: finalTotalPaisa - taxPaisa,
    taxPaisa,
    totalPaisa: finalTotalPaisa,
    advancePaisa: roundFraction(finalTotalPaisa * advancePercent, 100),
    calculatedTotalPaisa: q.totalPaisa,
  };
}

/** What a confirmed quote stores in quotes.snapshot. Totals also live on the quote row (total_paisa, advance_paisa). */
export type QuoteSnapshot = Pick<Quote, "lines" | "subtotalPaisa" | "taxPaisa" | "advancePaisa"> & {
  calculatedTotalPaisa: number;
  finalTotalPaisa: number;
  overrideReason: string | null;
  inputs: PriceInput;
};

/** A stored quote for display: stored totals, never re-summed lines (after an override the lines no longer add up). */
export const storedQuote = (
  s: Pick<Quote, "lines" | "subtotalPaisa" | "taxPaisa">,
  totalPaisa: number,
  advancePaisa: number,
): Quote => ({ lines: s.lines, subtotalPaisa: s.subtotalPaisa, taxPaisa: s.taxPaisa, totalPaisa, advancePaisa });

type OverrideFields = Pick<QuoteSnapshot, "calculatedTotalPaisa" | "finalTotalPaisa" | "overrideReason">;

/** Staff only: the calculated total and reason of an overridden quote, or null when the final total is the calculated one. */
export const quoteOverride = (s: OverrideFields): { calculatedPaisa: number; reason: string } | null =>
  s.overrideReason && s.calculatedTotalPaisa !== s.finalTotalPaisa ? { calculatedPaisa: s.calculatedTotalPaisa, reason: s.overrideReason } : null;

/** The customer's stored quote. After an override the calculated lines no longer explain the total, so only the totals show. */
export const customerQuote = (s: QuoteSnapshot, totalPaisa: number, advancePaisa: number): Quote =>
  storedQuote(s.calculatedTotalPaisa !== s.finalTotalPaisa ? { ...s, lines: [] } : s, totalPaisa, advancePaisa);

// An event-specific row beats the all-events (null) row.
export function pickDatePrice<T extends { eventTypeId: string | null }>(matches: T[], eventTypeId: string): T | null {
  return matches.find((m) => m.eventTypeId === eventTypeId) ?? matches.find((m) => m.eventTypeId === null) ?? null;
}
