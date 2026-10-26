import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  can,
  createServerClient,
  createServiceClient,
  ForbiddenError,
  getViewer,
  type PermissionKey,
  type Viewer,
} from "@/modules/access";
import { applyChange, DraftError, itemKey, type DraftChange } from "../changes";
import { ROW_TABLES, SiteDraftSchema, type SiteDraft } from "../draft";
import { requiredKeys } from "../keys";

/** itemKey -> who last changed that item. */
export type DraftChanges = Record<string, { by: string; name: string; at: string }>;

// shortcut: revision is a Postgres bigint read as a JS number; exact up to 2^53 saves, use a string if that is ever near.
type DraftRow = { revision: number; payload: unknown; changes: DraftChanges };

// Same keys as is_site_editor() in 20261026000500_site_drafts.sql.
const EDITOR_KEYS: PermissionKey[] = ["catalogue.edit", "prices.edit", "venue.info.edit", "tenant.settings.edit", "media.manage"];

const TRIES = 3;

/** The signed-in viewer, if they hold any site editing key in the venue. Platform admins also need aal2. */
export async function requireEditor(tenantId: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !EDITOR_KEYS.some((k) => can(viewer, tenantId, k))) throw new ForbiddenError();
  if (viewer.isPlatformAdmin && viewer.aal !== "aal2") throw new ForbiddenError("Platform admin needs MFA");
  return viewer;
}

async function readRow(db: SupabaseClient, tenantId: string): Promise<DraftRow | null> {
  const { data, error } = await db
    .from("site_drafts")
    .select("revision, payload, changes")
    .eq("tenant_id", tenantId)
    .maybeSingle<DraftRow>();
  if (error) throw new Error(`site_drafts: ${error.message}`);
  return data;
}

/** The published site in the draft's shape. */
export async function readSnapshot(db: SupabaseClient, tenantId: string): Promise<SiteDraft> {
  const { data, error } = await db.rpc("site_snapshot", { p_tenant: tenantId });
  if (error) throw new Error(`site_snapshot: ${error.message}`);
  return SiteDraftSchema.parse(data);
}

/** The venue's draft, or the published site with `revision: null` when nobody has saved a draft. */
export async function getDraft(tenantId: string): Promise<{ draft: SiteDraft; revision: number | null; changes: DraftChanges }> {
  await requireEditor(tenantId);
  const db = await createServerClient();
  const row = await readRow(db, tenantId);
  if (row) return { draft: SiteDraftSchema.parse(row.payload), revision: row.revision, changes: row.changes };
  return { draft: await readSnapshot(db, tenantId), revision: null, changes: {} };
}

// applyChange creates a row for an id the draft does not have; that id comes from the browser, so replace it.
function withServerId(draft: SiteDraft, change: DraftChange): DraftChange {
  if (!("id" in change) || change.value === null) return change;
  const rows: { id: string }[] = draft[ROW_TABLES[change.kind]];
  return rows.some((r) => r.id === change.id) ? change : { ...change, id: crypto.randomUUID() };
}

/**
 * Applies one change to the venue's draft (made from the published site on the first save) and stores it, if
 * `mayUse` allows every key the change needs. Optimistic: a save that lost a race re-reads and tries again.
 * Takes a service client; callers decide who the actor is.
 */
export async function writeDraft(
  db: SupabaseClient,
  tenantId: string,
  change: DraftChange,
  actor: { id: string; name: string },
  mayUse: (key: PermissionKey) => boolean,
): Promise<{ revision: number }> {
  for (let i = 0; i < TRIES; i++) {
    let row = await readRow(db, tenantId);
    if (!row) {
      const { error } = await db
        .from("site_drafts")
        .upsert({ tenant_id: tenantId, payload: await readSnapshot(db, tenantId) }, { onConflict: "tenant_id", ignoreDuplicates: true });
      if (error) throw new Error(`site_drafts: ${error.message}`);
      row = await readRow(db, tenantId);
      if (!row) continue; // published or discarded in between
    }
    const current = SiteDraftSchema.parse(row.payload);
    const own = withServerId(current, change);
    const next = SiteDraftSchema.parse(applyChange(current, own));
    if ([...requiredKeys(current, next)].some((k) => !mayUse(k))) throw new ForbiddenError();
    const changes = { ...row.changes, [itemKey(own)]: { by: actor.id, name: actor.name, at: new Date().toISOString() } };
    const { data, error } = await db.rpc("save_site_draft", {
      p_tenant: tenantId,
      p_expected_revision: row.revision,
      p_payload: next,
      p_changes: changes,
    });
    if (error) throw new Error(`save_site_draft: ${error.message}`);
    if (data !== null) return { revision: data as number };
  }
  throw new DraftError("busy");
}

async function actorName(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db.from("profiles").select("full_name").eq("user_id", userId).maybeSingle<{ full_name: string | null }>();
  if (error) throw new Error(`profiles: ${error.message}`);
  if (data?.full_name) return data.full_name;
  const user = await db.auth.admin.getUserById(userId);
  if (user.error) throw new Error(`auth user: ${user.error.message}`);
  return user.data.user.email ?? "";
}

/** Saves one change for the signed-in viewer. Throws ForbiddenError when it needs a key they lack. */
export async function saveDraftChange(tenantId: string, change: DraftChange): Promise<{ revision: number }> {
  const viewer = await requireEditor(tenantId);
  const db = createServiceClient();
  const actor = { id: viewer.userId, name: await actorName(db, viewer.userId) };
  return writeDraft(db, tenantId, change, actor, (k) => can(viewer, tenantId, k));
}

/** Throws away the draft the viewer saw. `siteChanged` when it was saved, published or discarded since. */
export async function discardDraft(tenantId: string, revision: number): Promise<{ ok: true } | { error: "siteChanged" }> {
  await requireEditor(tenantId);
  const { data, error } = await (await createServerClient())
    .from("site_drafts")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("revision", revision)
    .select("tenant_id");
  if (error) throw new Error(`site_drafts: ${error.message}`);
  return data.length ? { ok: true } : { error: "siteChanged" };
}
