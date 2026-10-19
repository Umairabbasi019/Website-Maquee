import { z } from "zod";

export const SlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens only");

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM");

export const IdentitySchema = z.object({
  name: z.string().min(1),
  logoUrl: z.url().optional(),
  tagline: z.string().optional(),
  phones: z.array(z.string().min(1)),
  address: z.string().optional(),
  mapLocation: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  openingHours: z.array(z.object({ day: z.number().int().min(0).max(6), open: Time, close: Time })),
  social: z.object({ instagram: z.url().optional(), facebook: z.url().optional() }),
  googleReviewUrl: z.url().optional(),
});

export const ThemeSchema = z.object({
  colors: z.object({ primary: Hex, background: Hex, text: Hex }),
  fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
});

export const SECTION_KEYS = ["hero", "inside", "stage", "gallery", "events", "packages", "contact", "footer"] as const;

export const SectionsSchema = z
  .array(z.object({ key: z.enum(SECTION_KEYS), visible: z.boolean() }))
  .refine((s) => s.length === SECTION_KEYS.length && new Set(s.map((x) => x.key)).size === SECTION_KEYS.length, {
    message: "each section key must appear exactly once",
  });

export const MoneyRulesSchema = z.object({
  currency: z.string().length(3).default("PKR"),
  timeZone: z.string().min(1).default("Asia/Karachi"),
  taxPercent: z.number().min(0).max(100).default(0),
  advancePercent: z.number().min(0).max(100).default(50),
  holdHours: z.number().int().positive().default(48),
  instantBooking: z.boolean().default(false),
  paymentMethods: z.array(z.enum(["bank", "jazzcash", "easypaisa", "gateway"])).default([]),
});

export const MessagingSchema = z.object({
  whatsappNumber: z.string().optional(),
  reminderDays: z.array(z.number().int().positive()),
  morningSummaryTime: Time,
  marketingCapPerMonth: z.number().int().min(0),
});

export const LimitsSchema = z.object({
  loginLimit: z.number().int().positive(),
  managerLimit: z.number().int().positive(),
});

export const TenantSettingsSchema = z.object({
  identity: IdentitySchema,
  theme: ThemeSchema,
  sections: SectionsSchema,
  moneyRules: MoneyRulesSchema,
  messaging: MessagingSchema,
  limits: LimitsSchema,
});

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;
