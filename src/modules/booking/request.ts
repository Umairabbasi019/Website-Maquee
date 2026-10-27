import { z } from "zod";

/** A Pakistani mobile (3XX XXXXXXX) in local, 92 or +92 form, with any spaces or hyphens, as E.164; else null. */
export function normalisePkMobile(raw: string): string | null {
  const m = /^(?:\+92|0092|92|0)(3\d{9})$/.exec(raw.replace(/[\s\-().]/g, ""));
  return m ? `+92${m[1]}` : null;
}

const Id = z.uuid();
const Guests = z.coerce.number().int().positive();

/** The public form. Ids are only shapes here; the server checks each against the venue's own active rows. */
export const BookingRequestSchema = z.object({
  date: z.iso.date(),
  slotId: Id,
  eventTypeId: Id,
  guests: Guests,
  // A form with no package chosen sends "".
  packageId: Id.optional().or(z.literal("").transform(() => undefined)),
  addonIds: z.array(Id).max(20).default([]),
  name: z.string().trim().min(1).max(80),
  phone: z.string().transform(normalisePkMobile).pipe(z.string()),
  whatsappConsent: z.boolean().default(false),
  // Honeypot: hidden from people, so only bots fill it.
  website: z.string().max(0).optional(),
});
export type BookingRequestInput = z.input<typeof BookingRequestSchema>;

/** The choices that change the price, for the live estimate before name and phone are typed. */
export const EstimateSchema = BookingRequestSchema.pick({ date: true, eventTypeId: true, guests: true, packageId: true, addonIds: true });

/** Today's date (YYYY-MM-DD) in the venue's time zone. */
export const todayIn = (timeZone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

/** A request may be for today up to 18 months ahead. */
export function inBookingWindow(date: string, today: string): boolean {
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + 18, d)).toISOString().slice(0, 10);
  return date >= today && date <= last;
}
