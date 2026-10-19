import "server-only";
import { cache } from "react";
import { PERMISSIONS, type PermissionKey } from "../permissions";
import { createServerClient } from "./supabase";

export type Viewer = {
  userId: string;
  isPlatformAdmin: boolean;
  aal: "aal1" | "aal2";
  memberships: { tenantId: string; role: string; keys: PermissionKey[] }[];
};

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

type ViewerParts = {
  userId: string;
  isPlatformAdmin: boolean;
  aal: Viewer["aal"];
  keys: { tenantId: string; key: string }[];
  roles: { tenantId: string; role: string }[];
};

const KNOWN_KEYS: ReadonlySet<string> = new Set(PERMISSIONS);

/** Pure assembly of a Viewer from the rows viewer_keys() and viewer_roles() return. */
export function buildViewer(parts: ViewerParts): Viewer {
  return {
    userId: parts.userId,
    isPlatformAdmin: parts.isPlatformAdmin,
    aal: parts.aal,
    memberships: parts.roles.map(({ tenantId, role }) => ({
      tenantId,
      role,
      keys: parts.keys.filter((k) => k.tenantId === tenantId && KNOWN_KEYS.has(k.key)).map((k) => k.key as PermissionKey),
    })),
  };
}

/**
 * The signed-in user with permissions read fresh from the DB. React cache() only dedupes
 * within one request; nothing here is stored across requests.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser(); // verifies the token with the auth server
  if (!auth.user) return null;

  const [admin, keys, roles, aal] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.rpc("viewer_keys"),
    supabase.rpc("viewer_roles"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  for (const r of [admin, keys, roles]) if (r.error) throw new Error(`getViewer: ${r.error.message}`);

  return buildViewer({
    userId: auth.user.id,
    isPlatformAdmin: admin.data === true,
    aal: aal.data?.currentLevel === "aal2" ? "aal2" : "aal1",
    keys: (keys.data ?? []).map((r: { tenant_id: string; key: string }) => ({ tenantId: r.tenant_id, key: r.key })),
    roles: (roles.data ?? []).map((r: { tenant_id: string; role: string }) => ({ tenantId: r.tenant_id, role: r.role })),
  });
});

/** Mirrors SQL auth_has_perm: platform admin passes, else the key must be held in that tenant. */
export function can(viewer: Viewer, tenantId: string, key: PermissionKey): boolean {
  if (viewer.isPlatformAdmin) return true;
  return viewer.memberships.some((m) => m.tenantId === tenantId && m.keys.includes(key));
}

/** Throws ForbiddenError unless the viewer may do `key` in `tenantId`. Platform admins also need aal2. */
export async function requirePerm(tenantId: string, key: PermissionKey): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, tenantId, key)) throw new ForbiddenError();
  if (viewer.isPlatformAdmin && viewer.aal !== "aal2") throw new ForbiddenError("Platform admin needs MFA");
  return viewer;
}
