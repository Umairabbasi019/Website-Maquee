import "server-only";
import { getDraft, getPublished, mediaUsage } from "@/modules/editor";

/** Media key → every place the published site or the draft uses it. */
export async function mediaUsedIn(tenantId: string): Promise<Map<string, string[]>> {
  const { draft, revision } = await getDraft(tenantId);
  // With no draft, getDraft already returned the published site.
  const sites = revision === null ? [draft] : [draft, await getPublished(tenantId)];
  const usage = new Map<string, string[]>();
  for (const site of sites) {
    for (const [key, labels] of mediaUsage(site)) usage.set(key, [...new Set([...(usage.get(key) ?? []), ...labels])]);
  }
  return usage;
}
