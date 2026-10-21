import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/modules/access";
import { getPublicCatalogue } from "@/modules/catalogue";
import { getPublicMedia } from "@/modules/media";
import {
  IdentitySchema,
  MessagingSchema,
  MoneyRulesSchema,
  SectionsSchema,
  SiteContentSchema,
  ThemeSchema,
  type TenantSettings,
} from "@/modules/tenants";
import type { SiteView } from "@/sections/types";

export type RawSite = {
  tenantId: string;
  status: SiteView["status"];
  identity: TenantSettings["identity"];
  theme: TenantSettings["theme"];
  sections: TenantSettings["sections"];
  moneyRules: TenantSettings["moneyRules"];
  messaging: TenantSettings["messaging"];
  content: TenantSettings["content"];
  media: SiteView["media"];
  catalogue: SiteView["catalogue"];
  slots: string[];
};

export function buildSiteView(raw: RawSite): SiteView {
  const { identity, messaging } = raw;
  const sections = raw.sections.filter((s) => s.visible).map((s) => s.key);
  return {
    tenantId: raw.tenantId,
    name: identity.name,
    status: raw.status,
    content: raw.content,
    theme: raw.theme,
    media: raw.media,
    catalogue: raw.catalogue,
    contact: {
      phone: identity.phones[0],
      whatsapp: messaging.whatsappNumber,
      hours: identity.openingHours,
      timeZone: raw.moneyRules.timeZone,
      address: identity.address,
      map: identity.mapLocation,
      instagram: identity.social.instagram,
    },
    slots: raw.slots,
    sections,
    navLinks: raw.content.nav.links.filter((l) => sections.includes(l.section)).map((l) => ({ href: `#${l.section}`, label: l.label })),
  };
}

function ok<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (!r.data) throw new Error(`${what}: not found`);
  return r.data;
}

/** Everything the public site needs for one tenant, or null when its settings do not parse. Deduplicated per request. */
export const getPublicSite = cache(async (tenantId: string): Promise<SiteView | null> => {
  const db = createServiceClient();
  const [tenant, settings, slots, media, catalogue] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    db
      .from("tenant_settings")
      .select("identity, theme, sections, money_rules, messaging, content")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    db.from("slots").select("name").eq("tenant_id", tenantId).order("start_time"),
    getPublicMedia(tenantId),
    getPublicCatalogue(tenantId),
  ]);
  const { status } = ok(tenant, "tenants");
  const row = ok(settings, "tenant_settings");
  if (status !== "setup" && status !== "live") return null;

  // Each column has its own schema: rows are snake_case and limits live on tenants, so the full settings schema does not fit.
  const identity = IdentitySchema.safeParse(row.identity);
  const theme = ThemeSchema.safeParse(row.theme);
  const sections = SectionsSchema.safeParse(row.sections);
  const moneyRules = MoneyRulesSchema.safeParse(row.money_rules);
  const messaging = MessagingSchema.safeParse(row.messaging);
  const content = SiteContentSchema.safeParse(row.content);
  if (!identity.success || !theme.success || !sections.success || !moneyRules.success || !messaging.success || !content.success) {
    const failed = [identity, theme, sections, moneyRules, messaging, content].flatMap((r) => (r.success ? [] : [r.error]));
    console.error(`getPublicSite: settings for tenant ${tenantId} do not parse`, failed);
    return null;
  }
  return buildSiteView({
    tenantId,
    status,
    identity: identity.data,
    theme: theme.data,
    sections: sections.data,
    moneyRules: moneyRules.data,
    messaging: messaging.data,
    content: content.data,
    media,
    catalogue,
    slots: ok(slots, "slots").map((s) => s.name),
  });
});
