// Prices are whole rupees in practice; paisa that is not a multiple of 100 rounds to the nearest rupee.
const rupees = (paisa: number) => Math.round(paisa / 100);

export function formatRs(paisa: number): string {
  return `Rs ${rupees(paisa).toLocaleString("en-PK")}`;
}

export function lakhFrom(pricePerGuestPaisa: number, guests: number): string {
  return ((rupees(pricePerGuestPaisa) * guests) / 1e5).toFixed(1);
}

// shortcut: Pakistan mobile numbers only; other numbers come back unchanged. Upgrade when a non-PK venue signs up.
export function formatLocalPhone(e164: string): string {
  const m = /^\+92(3\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
