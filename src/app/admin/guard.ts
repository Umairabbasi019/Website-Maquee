import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient, getViewer, needsMfa } from "@/modules/access";
import { isPlatformHost } from "@/modules/tenants";

/** /admin exists only on PLATFORM_HOST; any tenant host gets the platform 404. */
export async function assertPlatformHost(): Promise<void> {
  if (!isPlatformHost((await headers()).get("host") ?? "")) notFound();
}

/**
 * Every /admin page calls this itself, because a layout does not guard the pages it wraps (they
 * render in parallel). False means "signed in, not a platform admin": the page shows the 403 notice.
 * Actions do not use it: they call assertPlatformHost and requirePerm (which also demands aal2).
 */
export const adminGate = cache(async (): Promise<boolean> => {
  await assertPlatformHost();
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (await needsMfa(await createServerClient(), viewer.userId)) redirect("/mfa");
  return viewer.isPlatformAdmin && viewer.aal === "aal2";
});
