import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient, getViewer, hasPausedMembership, needsMfa } from "@/modules/access";

export const VENUE_COOKIE = "venue";

/**
 * Everything a dashboard request needs, read fresh once per request. The venue cookie is only a
 * preference: it counts only if it names a venue this viewer may open right now.
 */
export const getDashboard = cache(async () => {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const supabase = await createServerClient();
  if (await needsMfa(supabase, viewer.userId)) redirect("/mfa");

  // RLS returns only the viewer's live tenants, or every tenant for a platform admin at aal2.
  let query = supabase.from("tenants").select("id, name").order("name");
  if (!viewer.isPlatformAdmin) query = query.in("id", viewer.memberships.map((m) => m.tenantId));
  const { data: venues, error } = await query;
  if (error) throw new Error(`getDashboard: ${error.message}`);

  if (venues.length === 0 && !viewer.isPlatformAdmin) {
    if (await hasPausedMembership(viewer.userId)) return { viewer, venues, venue: null, paused: true };
    redirect("/auth/signed-out"); // deactivated: only a route handler can clear the session cookies
  }
  const chosen = (await cookies()).get(VENUE_COOKIE)?.value;
  const venue = venues.find((v) => v.id === chosen) ?? (venues.length === 1 ? venues[0] : null);
  return { viewer, venues, venue, paused: false };
});
