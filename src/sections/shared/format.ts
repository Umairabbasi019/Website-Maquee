// Prices are whole rupees in practice; paisa that is not a multiple of 100 rounds to the nearest rupee.
const rupees = (paisa: number) => Math.round(paisa / 100);

export function formatRs(paisa: number): string {
  return `Rs ${rupees(paisa).toLocaleString("en-PK")}`;
}

// Prices are SQL int paisa (max 2 147 483 647), so the cap stays under it.
const MAX_RUPEES = 20_000_000;

/** Rupees as people type them ("Rs 3,200", "3200.50") to paisa; null unless a positive amount with at most 2 decimals. */
export function parseRupees(input: string): number | null {
  // Regex without the u flag: \d is ASCII only, so Urdu and other digits are refused.
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/^rs\.?/i, "").replace(/[\s,]/g, ""));
  if (!m) return null;
  const paisa = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paisa > 0 && paisa <= MAX_RUPEES * 100 ? paisa : null;
}

export function lakhFrom(pricePerGuestPaisa: number, guests: number): string {
  return ((rupees(pricePerGuestPaisa) * guests) / 1e5).toFixed(1);
}

// shortcut: Pakistan mobile numbers only; other numbers come back unchanged. Upgrade when a non-PK venue signs up.
export function formatLocalPhone(e164: string): string {
  const m = /^\+92(3\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
