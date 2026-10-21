import "server-only";
import { createServerClient, recordAudit, requirePerm } from "@/modules/access";
import { setupChecklist, type ChecklistItem } from "../checklist";
import { IdentitySchema } from "../settings";
import { normalizeHost } from "./resolve";

// Super admin console reads and writes. Every function checks platform.tenants.manage (aal2) itself;
// queries run on the caller's session, so RLS (is_platform_admin) repeats the check in the database.

export const TENANT_STATUSES = ["setup", "live", "paused"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export type TenantSummary = {
  id: string;
  name: string;
  status: TenantStatus;
  domain: string; // verified custom domain, else the platform address
  lastActivity: string | null; // newest audit event
  checklist: ChecklistItem[];
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  tenant_domains: { host: string; verified_at: string | null }[];
  tenant_settings: { identity: unknown } | null;
  halls: { count: number }[];
  packages: { count: number }[];
  media_assets: { count: number }[];
};

const MANAGE = "platform.tenants.manage";

// Throws on error; the return type drops the failure variant, so callers see non-null data.
function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

function summarise(row: TenantRow, lastActivity: string | null): TenantSummary {
  const verified = row.tenant_domains.filter((d) => d.verified_at);
  const identity = IdentitySchema.safeParse(row.tenant_settings?.identity);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    domain: verified[0]?.host ?? `${row.slug}.${normalizeHost(process.env.PLATFORM_HOST ?? "")}`,
    lastActivity,
    checklist: setupChecklist(
      { identity: identity.success ? identity.data : { name: row.name, phones: [], openingHours: [], social: {} } },
      {
        domains: verified.length,
        halls: row.halls[0]?.count ?? 0,
        // shortcut: payment accounts have no table until M5, so this item stays honestly "missing".
        packages: row.packages[0]?.count ?? 0,
        heroMedia: row.media_assets[0]?.count ?? 0,
        paymentAccounts: 0,
      },
    ),
  };
}

const TENANT_SELECT =
  "id, name, slug, status, tenant_domains(host, verified_at), tenant_settings(identity), halls(count), packages(count), media_assets(count)";

async function lastActivity(db: Awaited<ReturnType<typeof createServerClient>>, tenantId: string) {
  const rows = check(
    await db
      .from("audit_events")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1),
    "lastActivity",
  );
  return (rows[0]?.created_at as string | undefined) ?? null;
}

export async function listTenants(): Promise<TenantSummary[]> {
  await requirePerm(null, MANAGE);
  const db = await createServerClient();
  const rows = check(
    await db.from("tenants").select(TENANT_SELECT).eq("halls.is_active", true).order("name"),
    "listTenants",
  ) as unknown as TenantRow[];
  // shortcut: one audit query per tenant (fine for tens of tenants); move to a SQL view when the list grows.
  return Promise.all(rows.map(async (r) => summarise(r, await lastActivity(db, r.id))));
}

export type TenantDetail = TenantSummary & {
  slug: string;
  loginLimit: number;
  managerLimit: number;
  activeMembers: number;
  activeManagers: number;
  features: { key: string; enabled: boolean }[];
};

/** null when no such tenant. */
export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  await requirePerm(tenantId, MANAGE);
  const db = await createServerClient();
  const row = check(
    await db
      .from("tenants")
      .select(`${TENANT_SELECT}, login_limit, manager_limit`)
      .eq("id", tenantId)
      .eq("halls.is_active", true)
      .maybeSingle(),
    "getTenantDetail",
  ) as unknown as (TenantRow & { login_limit: number; manager_limit: number }) | null;
  if (!row) return null;
  const [activity, features, members] = await Promise.all([
    lastActivity(db, tenantId),
    db.from("tenant_features").select("feature_key, enabled").eq("tenant_id", tenantId).order("feature_key"),
    db.from("memberships").select("roles(name)").eq("tenant_id", tenantId).eq("is_active", true),
  ]);
  const active = check(members, "members") as unknown as { roles: { name: string } | null }[];
  return {
    ...summarise(row, activity),
    slug: row.slug,
    loginLimit: row.login_limit,
    managerLimit: row.manager_limit,
    activeMembers: active.length,
    activeManagers: active.filter((m) => m.roles?.name === "manager").length,
    features: check(features, "features").map((f) => ({ key: f.feature_key, enabled: f.enabled })),
  };
}

export async function listTemplates(): Promise<{ id: string; name: string }[]> {
  await requirePerm(null, MANAGE);
  return check(
    await (await createServerClient()).from("tenant_templates").select("id, name").order("name"),
    "listTemplates",
  );
}

export async function listAccounts(): Promise<{ id: string; name: string }[]> {
  await requirePerm(null, MANAGE);
  return check(await (await createServerClient()).from("accounts").select("id, name").order("name"), "listAccounts");
}

/** New billing account for a venue. Platform event in the audit log. */
export async function createAccount(name: string): Promise<string> {
  await requirePerm(null, MANAGE);
  const { id } = check(
    await (await createServerClient()).from("accounts").insert({ name }).select("id").single(),
    "createAccount",
  );
  await recordAudit({ tenantId: null, action: "account.create", entity: "account", entityId: id, after: { name } });
  return id;
}

/** Undo for createAccount when the tenant insert that needed it failed; only removes an account with no tenants. */
export async function deleteEmptyAccount(accountId: string): Promise<void> {
  await requirePerm(null, MANAGE);
  const db = await createServerClient();
  const tenants = check(
    await db.from("tenants").select("id").eq("account_id", accountId).limit(1),
    "deleteEmptyAccount",
  );
  if (tenants.length > 0) return;
  check(await db.from("accounts").delete().eq("id", accountId), "deleteEmptyAccount");
  await recordAudit({
    tenantId: null,
    action: "account.delete",
    entity: "account",
    entityId: accountId,
    reason: "tenant create failed",
  });
}

export async function setStatus(tenantId: string, status: TenantStatus): Promise<void> {
  await requirePerm(tenantId, MANAGE);
  const db = await createServerClient();
  const before = check(await db.from("tenants").select("status").eq("id", tenantId).single(), "setStatus");
  check(await db.from("tenants").update({ status }).eq("id", tenantId).select("id").single(), "setStatus");
  await recordAudit({
    tenantId,
    action: "tenant.status",
    entity: "tenant",
    entityId: tenantId,
    before,
    after: { status },
  });
}

/** Switches a feature the tenant already has (from its template); unknown keys are refused. */
export async function setFeature(tenantId: string, key: string, enabled: boolean): Promise<void> {
  await requirePerm(tenantId, MANAGE);
  const updated = check(
    await (
      await createServerClient()
    )
      .from("tenant_features")
      .update({ enabled })
      .eq("tenant_id", tenantId)
      .eq("feature_key", key)
      .select("feature_key"),
    "setFeature",
  );
  if (updated.length !== 1) throw new Error(`setFeature: unknown feature ${key}`);
  await recordAudit({
    tenantId,
    action: "tenant.feature",
    entity: "tenant",
    entityId: tenantId,
    after: { key, enabled },
  });
}

export type LimitsResult = "ok" | "login_limit_below_active" | "manager_limit_below_active";

/** Count and update happen in one SQL function with the tenant row locked (see set_tenant_limits). */
export async function setLimits(tenantId: string, loginLimit: number, managerLimit: number): Promise<LimitsResult> {
  await requirePerm(tenantId, MANAGE);
  const db = await createServerClient();
  const before = check(
    await db.from("tenants").select("login_limit, manager_limit").eq("id", tenantId).single(),
    "setLimits",
  );
  const { error } = await db.rpc("set_tenant_limits", {
    p_tenant: tenantId,
    p_login: loginLimit,
    p_manager: managerLimit,
  });
  if (error?.message === "login_limit_below_active" || error?.message === "manager_limit_below_active")
    return error.message;
  if (error) throw new Error(`setLimits: ${error.message}`);
  await recordAudit({
    tenantId,
    action: "tenant.limits",
    entity: "tenant",
    entityId: tenantId,
    before,
    after: { login_limit: loginLimit, manager_limit: managerLimit },
  });
  return "ok";
}
