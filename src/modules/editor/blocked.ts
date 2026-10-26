import type { PermissionKey } from "@/modules/access";
import { ROW_TABLES, type RowKind, type SiteDraft } from "./draft";
import { requiredKeys } from "./keys";
import { mediaRefs } from "./media-usage";

type Path = (string | number)[];
type Row = { id: string; name?: string; title?: string; eventTypeId?: string };

const get = (root: unknown, path: Path): unknown =>
  path.reduce<unknown>((o, k) => (o !== null && typeof o === "object" ? (o as Record<string | number, unknown>)[k] : undefined), root);

function put(root: object, path: Path, value: unknown) {
  const parent = get(root, path.slice(0, -1));
  if (parent === null || typeof parent !== "object") return;
  const obj = parent as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (value === undefined) delete obj[last];
  else obj[last] = structuredClone(value);
}

const ROW_LABELS: Record<RowKind, string> = {
  event: "Event",
  package: "Package",
  offer: "Offer",
  addon: "Add-on",
  stageTheme: "Stage theme",
};

/** The published site with only the item `key` (an itemKey) taken from the draft, and that item's label. */
function probe(published: SiteDraft, draft: SiteDraft, key: string): { site: SiteDraft; label: string } {
  const at = key.indexOf(":");
  const [kind, rest] = [key.slice(0, at), key.slice(at + 1)];
  const site = structuredClone(published);
  if (kind === "settings") {
    const path = rest.split(".");
    put(site, path, get(draft, path));
    return { site, label: `Settings: ${rest}` };
  }
  if (kind === "media") {
    const refs = mediaRefs(published).filter((r) => r.key === rest);
    for (const { path } of refs) put(site, path, get(draft, path));
    return { site, label: [...new Set(refs.map((r) => r.label))].join(", ") || `Photo: ${rest}` };
  }
  const table = ROW_TABLES[kind as RowKind];
  const live = site[table] as Row[];
  const mine = (draft[table] as Row[]).find((r) => r.id === rest);
  const i = live.findIndex((r) => r.id === rest);
  const shown = mine ?? live[i];
  if (i >= 0) live.splice(i, 1);
  if (mine) live.push(structuredClone(mine));
  const event = shown?.eventTypeId && draft.events.find((e) => e.id === shown.eventTypeId)?.name;
  return { site, label: `${ROW_LABELS[kind as RowKind]}: ${shown?.name ?? shown?.title ?? rest}${event ? ` (${event})` : ""}` };
}

/** Labels of the changed items (keys of the draft's `changes`) that need a key outside `held`. */
export function blockedItems(published: SiteDraft, draft: SiteDraft, changed: string[], held: (key: PermissionKey) => boolean): string[] {
  return changed.flatMap((key) => {
    const { site, label } = probe(published, draft, key);
    return [...requiredKeys(published, site)].some((k) => !held(k)) ? [label] : [];
  });
}
