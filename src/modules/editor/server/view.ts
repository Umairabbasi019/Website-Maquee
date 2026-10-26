import "server-only";
import { createServiceClient } from "@/modules/access";
import { toPublicCatalogue } from "@/modules/catalogue";
import { getPublicMedia } from "@/modules/media";
import { buildSiteView } from "@/modules/site";
import { MoneyRulesSchema } from "@/modules/tenants";
import type { SiteView } from "@/sections/types";
import type { SiteDraft } from "../draft";
import { getDraft, requireEditor } from "./draft";

/**
 * The site as the draft would show it, with edit markers. Only for site editors. Pass the draft a caller already
 * read with getDraft, so the view and that read's revision are the same draft.
 */
export async function getDraftView(tenantId: string, read?: SiteDraft): Promise<SiteView> {
  await requireEditor(tenantId);
  const draft = read ?? (await getDraft(tenantId)).draft;
  // Service client: a prices-only editor cannot read tenant_settings, and only money rules and slots come from it.
  const db = createServiceClient();
  const [tenant, settings, slots, media] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).single<{ status: string }>(),
    db.from("tenant_settings").select("money_rules").eq("tenant_id", tenantId).single<{ money_rules: unknown }>(),
    db.from("slots").select("name").eq("tenant_id", tenantId).order("start_time").returns<{ name: string }[]>(),
    getPublicMedia(tenantId),
  ]);
  for (const r of [tenant, settings, slots]) if (r.error) throw new Error(`getDraftView: ${r.error.message}`);
  const view = buildSiteView({
    tenantId,
    // A paused venue is edited like one in setup; the editor never shows the setup banner.
    status: tenant.data!.status === "live" ? "live" : "setup",
    identity: draft.identity,
    theme: draft.theme,
    sections: draft.sections,
    moneyRules: MoneyRulesSchema.parse(settings.data!.money_rules),
    messaging: draft.messaging,
    content: draft.content,
    media,
    catalogue: toPublicCatalogue(draft),
    slots: slots.data!.map((s) => s.name),
  });
  return { ...view, editing: true };
}
