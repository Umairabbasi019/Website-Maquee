import "server-only";
import { can, createServerClient, type PermissionKey } from "@/modules/access";
import { getPublicMedia } from "@/modules/media";
import { blockedItems } from "../blocked";
import { checkDraft } from "../check";
import { SiteDraftSchema } from "../draft";
import { requiredKeys } from "../keys";
import { readSnapshot, requireEditor, type DraftChanges } from "./draft";

export type PublishResult =
  | { ok: true }
  | { error: "siteChanged" | "blocked" | "invalid" | "eventHasDatePrices"; items?: string[] };

const SITE_CHANGED = "40001";
const NO_KEY = "42501";
const DATE_PRICES = /^event has date prices: (.+)$/;
// publish_site refuses a venue rename unless a platform admin publishes it; the TS keys cannot see that rule.
const VENUE_NAME = "venue name needs a platform admin";

/** Puts the draft the viewer saw (at `revision`) live, in one transaction run as the viewer (publish_site). */
export async function publishDraft(tenantId: string, revision: number): Promise<PublishResult> {
  const viewer = await requireEditor(tenantId);
  const db = await createServerClient();
  const { data: row, error } = await db
    .from("site_drafts")
    .select("payload, changes")
    .eq("tenant_id", tenantId)
    .eq("revision", revision)
    .maybeSingle<{ payload: unknown; changes: DraftChanges }>();
  if (error) throw new Error(`site_drafts: ${error.message}`);
  if (!row) return { error: "siteChanged" };
  const draft = SiteDraftSchema.parse(row.payload);

  const media = Object.fromEntries(
    Object.values(await getPublicMedia(tenantId)).map((m) => [m.key, { alt: m.alt, sizes: [...Object.keys(m.urls), ...(m.depthUrl ? ["depth"] : [])] }]),
  );
  const issues = checkDraft(draft, media).filter((i) => i.code !== "depthMissing");
  if (issues.length) return { error: "invalid", items: [...new Set(issues.map((i) => i.item))] };

  // The database checks every key again; this only names the items first.
  const held = (k: PermissionKey) => can(viewer, tenantId, k);
  const published = await readSnapshot(db, tenantId);
  if ([...requiredKeys(published, draft)].some((k) => !held(k))) {
    return { error: "blocked", items: blockedItems(published, draft, Object.keys(row.changes), held) };
  }

  const { error: failed } = await db.rpc("publish_site", { p_tenant: tenantId, p_revision: revision });
  if (!failed) return { ok: true };
  if (failed.code === SITE_CHANGED) return { error: "siteChanged" };
  if (failed.code === NO_KEY) {
    const event = DATE_PRICES.exec(failed.message)?.[1];
    if (event) return { error: "eventHasDatePrices", items: [event] };
    return { error: "blocked", items: failed.message === VENUE_NAME ? ["Venue: name"] : undefined };
  }
  throw new Error(`publish_site: ${failed.message}`);
}
