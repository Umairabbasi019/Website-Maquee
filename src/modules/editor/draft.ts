import { z } from "zod";
import {
  AddonRowSchema,
  EventTypeRowSchema,
  OfferRowSchema,
  PackageRowSchema,
  StageThemeRowSchema,
} from "@/modules/catalogue/client";
import { IdentitySchema, MessagingSchema, SectionsSchema, SiteContentSchema, ThemeSchema } from "@/modules/tenants/client";

/** Everything the public site reads, as one venue draft. site_snapshot() in SQL returns this same shape. */
export const SiteDraftSchema = z.object({
  identity: IdentitySchema,
  theme: ThemeSchema,
  sections: SectionsSchema,
  messaging: MessagingSchema,
  content: SiteContentSchema,
  events: z.array(EventTypeRowSchema),
  packages: z.array(PackageRowSchema),
  offers: z.array(OfferRowSchema),
  addons: z.array(AddonRowSchema),
  stageThemes: z.array(StageThemeRowSchema),
});

export type SiteDraft = z.infer<typeof SiteDraftSchema>;

export const SETTINGS_PARTS = ["identity", "theme", "sections", "messaging", "content"] as const;
export type SettingsPart = (typeof SETTINGS_PARTS)[number];

/** Draft array for each catalogue change kind. */
export const ROW_TABLES = {
  event: "events",
  package: "packages",
  offer: "offers",
  addon: "addons",
  stageTheme: "stageThemes",
} as const;
export type RowKind = keyof typeof ROW_TABLES;
