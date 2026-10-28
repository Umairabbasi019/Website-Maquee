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

/** The last date a request may be for: 18 months after `today`. */
export function lastBookingDay(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + 18, d)).toISOString().slice(0, 10);
}

/** A request may be for today up to 18 months ahead. */
export const inBookingWindow = (date: string, today: string): boolean => date >= today && date <= lastBookingDay(today);

/** The form's fields as text, the way the browser posts them; the add-ons are a list and the WhatsApp box is ticked or not. */
export type RequestFormValues = {
  date: string;
  slotId: string;
  eventTypeId: string;
  guests: string;
  packageId: string;
  addonIds: string[];
  name: string;
  phone: string;
  whatsappConsent: boolean;
  website: string;
};

/** The field names that fail the schema, or a general message ("invalid": a choice the venue refused; "limited": too many requests). */
export type RequestFormState = {
  values: RequestFormValues;
  errors: string[];
  message: "invalid" | "limited";
} | null;

export function readRequestForm(fd: FormData): RequestFormValues {
  const text = (key: string) => String(fd.get(key) ?? "");
  return {
    date: text("date"),
    slotId: text("slotId"),
    eventTypeId: text("eventTypeId"),
    guests: text("guests"),
    packageId: text("packageId"),
    addonIds: fd.getAll("addonIds").map(String),
    name: text("name"),
    phone: text("phone"),
    whatsappConsent: fd.get("whatsappConsent") === "on",
    website: text("website"),
  };
}

/** Which fields fail the schema's shape checks, for messages beside each field. */
export function requestFieldErrors(values: RequestFormValues): string[] {
  const r = BookingRequestSchema.safeParse(values);
  return r.success ? [] : [...new Set(r.error.issues.map((i) => String(i.path[0])))];
}
