import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicSite } from "@/modules/site";

/** The host's venue id, set by src/proxy.ts from the host; any copy sent by the browser is dropped there. */
export const hostTenant = async () => (await headers()).get("x-tenant-id");

/** The host's public venue, or the 404 page (no venue on this host, or paused). */
export async function hostSite() {
  const tenantId = await hostTenant();
  const site = tenantId && (await getPublicSite(tenantId));
  if (!site) notFound();
  return site;
}
