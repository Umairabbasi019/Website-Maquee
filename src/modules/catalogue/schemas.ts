import { z } from "zod";
import { SlugSchema } from "@/modules/tenants/client";

// Rows as the editor draft holds them: camelCase of the SQL columns, with the same checks as the table constraints.
// Integer columns are SQL int, so values stay within int32.
const Id = z.uuid();
const Sort = z.int32();
const Paisa = z.int32().positive();
const Name = (max: number) => z.string().min(1).max(max);
const Day = z.iso.date().nullable();

export const EventTypeRowSchema = z.object({
  id: Id,
  slug: SlugSchema,
  name: Name(60),
  description: z.string().max(400),
  mediaKey: z.string().min(1).nullable(),
  sort: Sort,
  sample: z.boolean(),
});

export const PackageRowSchema = z.object({
  id: Id,
  eventTypeId: Id,
  name: Name(40),
  pricePerGuestPaisa: Paisa,
  minGuests: z.int32().positive(),
  items: z.array(Name(80)).min(1).max(30),
  featured: z.boolean(),
  sort: Sort,
  sample: z.boolean(),
});

const offerFields = z.object({
  id: Id,
  title: Name(60),
  body: Name(200),
  active: z.boolean(),
  sort: Sort,
  sample: z.boolean(),
  discountKind: z.enum(["percent", "fixed"]).nullable(),
  discountValue: z.int32().nullable(),
  startsOn: Day,
  endsOn: Day,
});

export const AddonRowSchema = z.object({
  id: Id,
  name: Name(60),
  pricePaisa: Paisa,
  basis: z.enum(["flat", "per_guest"]),
  active: z.boolean(),
  sort: Sort,
  sample: z.boolean(),
});

export const StageThemeRowSchema = z.object({
  id: Id,
  name: Name(60),
  description: z.string().max(300),
  pricePaisa: Paisa,
  mediaKeys: z.array(z.string().min(1)).max(8),
  active: z.boolean(),
  sort: Sort,
  sample: z.boolean(),
});

type OfferDiscount = Pick<z.infer<typeof offerFields>, "discountKind" | "discountValue" | "startsOn" | "endsOn">;

// Mirrors the offers_discount_* and offers_dates constraints. Zod cannot omit fields from a refined object,
// so the check is applied separately to the row and to the editor's value shape.
function checkOffer(o: OfferDiscount, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if ((o.discountKind === null) !== (o.discountValue === null)) issue("discountValue", "discount needs both a kind and a value");
  if (o.discountKind === "percent" && o.discountValue !== null && (o.discountValue < 1 || o.discountValue > 100)) {
    issue("discountValue", "percent must be 1 to 100");
  }
  if (o.discountKind === "fixed" && o.discountValue !== null && o.discountValue <= 0) issue("discountValue", "must be more than 0");
  if (o.startsOn && o.endsOn && o.endsOn < o.startsOn) issue("endsOn", "must not be before the start date");
}

export const OfferRowSchema = offerFields.superRefine(checkOffer);

export type EventTypeRow = z.infer<typeof EventTypeRowSchema>;
export type PackageRow = z.infer<typeof PackageRowSchema>;
export type OfferRow = z.infer<typeof OfferRowSchema>;
export type AddonRow = z.infer<typeof AddonRowSchema>;
export type StageThemeRow = z.infer<typeof StageThemeRowSchema>;

const serverSet = { id: true, sample: true } as const;

/** What an editor may send for a row: no id or sample flag (set by the server), and no slug for events (fixed at create). */
export const ROW_VALUE_SCHEMAS = {
  event: EventTypeRowSchema.omit({ ...serverSet, slug: true }),
  package: PackageRowSchema.omit(serverSet),
  offer: offerFields.omit(serverSet).superRefine(checkOffer),
  addon: AddonRowSchema.omit(serverSet),
  stageTheme: StageThemeRowSchema.omit(serverSet),
};
