import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase";

/** Raw platform_admins lookup, valid at aal1 (the DB's is_platform_admin() says false until aal2). */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`isPlatformAdminUser: ${error.message}`);
  return data !== null;
}

/**
 * True while the session is aal1 and the user must pass TOTP first: they hold a verified factor,
 * or they are a platform admin (who must enrol one). `supabase` is the caller's cookie client.
 */
export async function needsMfa(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(`needsMfa: ${error.message}`);
  if (data.currentLevel === "aal2") return false;
  return data.nextLevel === "aal2" || (await isPlatformAdminUser(userId));
}

/** True if the user has an active membership in a paused tenant (members cannot read paused rows). */
export async function hasPausedMembership(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("memberships")
    .select("id, tenants!inner(status)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("tenants.status", "paused")
    .limit(1);
  if (error) throw new Error(`hasPausedMembership: ${error.message}`);
  return data.length > 0;
}
