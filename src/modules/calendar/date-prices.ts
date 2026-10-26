import { z } from "zod";

const DateString = z.iso.date();

export const DatePriceSchema = z
  .object({
    id: z.uuid().optional(),
    startsOn: DateString,
    endsOn: DateString,
    eventTypeId: z.uuid().nullable(),
    kind: z.enum(["percent", "per_guest"]),
    /** Percent (-90..300) or paisa per guest. */
    value: z.number().int().refine((v) => v !== 0, "value cannot be 0"),
    label: z.string().min(1).max(60),
  })
  .refine((r) => r.endsOn >= r.startsOn, { path: ["endsOn"], message: "end is before start" })
  .refine((r) => r.kind !== "percent" || (r.value >= -90 && r.value <= 300), {
    path: ["value"],
    message: "percent must be between -90 and 300",
  });

export type DatePrice = z.infer<typeof DatePriceSchema>;
