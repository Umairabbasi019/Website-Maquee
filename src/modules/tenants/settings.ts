import { z } from "zod";

export const SlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens only");

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");
// Public links and images: https only, so a stored value can never become a javascript: or plain-http link.
const Url = z.url({ protocol: /^https$/ });
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM");

export const IdentitySchema = z.object({
  name: z.string().min(1),
  logoUrl: Url.optional(),
  tagline: z.string().optional(),
  phones: z.array(z.string().min(1)),
  address: z.string().optional(),
  mapLocation: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  openingHours: z.array(z.object({ day: z.number().int().min(0).max(6), open: TimeSchema, close: TimeSchema })),
  social: z.object({ instagram: Url.optional(), facebook: Url.optional() }),
  googleReviewUrl: Url.optional(),
});

export const ThemeSchema = z.object({
  colors: z.object({ primary: Hex, background: Hex, text: Hex, muted: Hex, deep: Hex }),
  fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
  logo: z.string().min(1).optional(),
});

export const SECTION_KEYS = ["hero", "inside", "stage", "gallery", "events", "packages", "contact", "footer"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SectionsSchema = z
  .array(z.object({ key: z.enum(SECTION_KEYS), visible: z.boolean() }))
  .refine((s) => s.length === SECTION_KEYS.length && new Set(s.map((x) => x.key)).size === SECTION_KEYS.length, {
    message: "each section key must appear exactly once",
  });

const AccountField = z.string().trim().min(1).max(80);

export const MoneyRulesSchema = z.object({
  currency: z.string().length(3).default("PKR"),
  timeZone: z.string().min(1).default("Asia/Karachi"),
  taxPercent: z.number().min(0).max(100).default(0),
  advancePercent: z.number().min(0).max(100).default(50),
  holdHours: z.number().int().positive().default(48),
  instantBooking: z.boolean().default(false),
  showPriceEstimate: z.boolean().default(true),
  paymentMethods: z.array(z.enum(["bank", "jazzcash", "easypaisa", "gateway"])).default([]),
  advanceDueDays: z.number().int().min(0).max(60).default(3),
  // Shown to customers, so not secret. The bank account number may be an IBAN.
  paymentAccounts: z
    .object({
      bank: z.object({ bankName: AccountField, accountTitle: AccountField, accountNumber: AccountField }).optional(),
      jazzcash: z.object({ accountTitle: AccountField, number: AccountField }).optional(),
      easypaisa: z.object({ accountTitle: AccountField, number: AccountField }).optional(),
    })
    .default({}),
});

export const MessagingSchema = z.object({
  whatsappNumber: z.string().optional(),
  reminderDays: z.array(z.number().int().positive()),
  morningSummaryTime: TimeSchema,
  marketingCapPerMonth: z.number().int().min(0),
});

export const LimitsSchema = z.object({
  loginLimit: z.number().int().positive(),
  managerLimit: z.number().int().positive(),
});

export const HERO_MODES = ["photos", "depth"] as const;

const Text = z.string().min(1);
// 1 to 3 display lines; `*word*` marks the accent italic.
const Lines = z.array(Text).min(1).max(3);
const Caption = z.object({ chapter: Text, lines: Lines, body: Text.optional() });
const withToken = (token: string) => Text.refine((v) => v.includes(token), { message: `must contain ${token}` });

export const MediaRefSchema = z.object({
  key: Text,
  focus: z.string().regex(/^\d{1,3}% \d{1,3}%$/, 'must look like "50% 58%"').optional(),
});

const Guests = z
  .object({ min: z.number().int().positive(), max: z.number().int().positive(), step: z.number().int().positive(), default: z.number().int().positive() })
  .refine((g) => g.min <= g.default && g.default <= g.max, { message: "guests need min <= default <= max" });

export const SiteContentSchema = z.object({
  sample: z.boolean().default(false),
  seo: z.object({ title: Text, description: Text, image: Text }),
  nav: z.object({ brand: Text, cta: Text, links: z.array(z.object({ section: z.enum(SECTION_KEYS), label: Text })) }),
  hero: z.object({
    mode: z.enum(HERO_MODES).default("photos"),
    front: MediaRefSchema,
    hall: MediaRefSchema,
    captions: z.object({
      arrival: Caption.extend({ primaryCta: Text, secondaryCta: Text }),
      doors: Caption,
      hall: Caption,
    }),
  }),
  inside: z.object({
    chapter: Text,
    title: Lines,
    rooms: z.array(z.object({ media: MediaRefSchema, chapter: Text, lines: Lines })).min(1).max(4),
  }),
  stage: z.object({ background: MediaRefSchema, reveal: MediaRefSchema, caption: Caption }),
  gallery: z.object({
    chapter: Text,
    lines: Lines,
    followLabel: Text.optional(),
    tiles: z.array(z.object({ key: Text, ratio: z.number().positive() })).min(4),
    rating: z
      .object({
        value: z.number().min(0).max(5),
        count: z.number().int().min(0),
        source: Text,
        checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
        url: Url,
      })
      .optional(),
  }),
  events: z.object({ chapter: Text, checkCta: withToken("{event}"), packagesCta: Text }),
  packages: z.object({
    chapter: Text,
    lines: Lines,
    lead: Text,
    fine: Text,
    background: MediaRefSchema,
    defaultEvent: SlugSchema.optional(),
  }),
  contact: z.object({
    media: MediaRefSchema,
    lines: Lines,
    lead: Text,
    greeting: Text,
    otherEvent: Text,
    guests: Guests,
    manager: z.object({ name: Text, role: Text, replyNote: Text }),
    sendCta: withToken("{name}"),
    callCta: withToken("{phone}"),
    compareLink: Text,
    openText: Text,
    closedText: withToken("{time}"),
    map: z.object({
      title: Text,
      place: Text,
      facts: z.array(z.object({ label: Text, value: Text })),
      directionsCta: Text,
    }),
  }),
  footer: z.object({ line: Text, copyright: Text, mark: Text }),
});

export type SiteContent = z.infer<typeof SiteContentSchema>;

export const TenantSettingsSchema = z.object({
  identity: IdentitySchema,
  theme: ThemeSchema,
  sections: SectionsSchema,
  moneyRules: MoneyRulesSchema,
  messaging: MessagingSchema,
  limits: LimitsSchema,
  content: SiteContentSchema,
});

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;
