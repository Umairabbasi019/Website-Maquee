import "server-only";
import { createServiceClient } from "@/modules/access";

export type ResolvedTenant = { tenantId: string; status: "setup" | "live" | "paused" };

/** Lowercase, trim, drop port, trailing dot and a leading www. */
export function normalizeHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/**
 * Host name -> tenant, for public pages only. Looks up a verified custom domain first, then
 * <slug>.<PLATFORM_HOST>. Uses the service client because anon cannot read these tables.
 * shortcut: one DB round trip per request, no cache; add a short TTL cache if proxy latency shows up.
 */
export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const h = normalizeHost(host);
  if (!h) return null;
  const db = createServiceClient();

  const domain = await db
    .from("tenant_domains")
    .select("tenants!inner(id, status)")
    .eq("host", h)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (domain.error) throw new Error(`resolveTenantByHost: ${domain.error.message}`);
  if (domain.data) return toResolved(domain.data.tenants);

  const root = normalizeHost(process.env.PLATFORM_HOST ?? "");
  if (!root || !h.endsWith(`.${root}`)) return null;
  const slug = h.slice(0, -(root.length + 1));
  if (slug.includes(".")) return null;

  const tenant = await db.from("tenants").select("id, status").eq("slug", slug).maybeSingle();
  if (tenant.error) throw new Error(`resolveTenantByHost: ${tenant.error.message}`);
  return tenant.data ? toResolved(tenant.data) : null;
}

function toResolved(row: unknown): ResolvedTenant {
  const t = (Array.isArray(row) ? row[0] : row) as { id: string; status: ResolvedTenant["status"] };
  return { tenantId: t.id, status: t.status };
}
