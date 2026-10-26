import type { PermissionKey } from "@/modules/access";
import { SETTINGS_PARTS, type SettingsPart, type SiteDraft } from "./draft";

// TS mirror of the SQL triggers. Keep in step with check_settings_write (20261026000300_settings_m3.sql), the
// check_column_perms arguments (20261026000200_catalogue_m3.sql) and its sample rule (20261026000250_sample_flag_free.sql); tests/fixtures/field-permissions.ts tests both.
const SETTINGS_FIELDS: { part: SettingsPart; path: string[]; key: PermissionKey }[] = [
  { part: "identity", path: ["phones"], key: "venue.info.edit" },
  { part: "identity", path: ["address"], key: "venue.info.edit" },
  { part: "identity", path: ["openingHours"], key: "venue.info.edit" },
  { part: "content", path: ["contact", "manager"], key: "venue.info.edit" },
  { part: "content", path: ["gallery", "tiles"], key: "catalogue.edit" },
  { part: "content", path: ["packages", "defaultEvent"], key: "catalogue.edit" },
];
const SETTINGS_KEY: PermissionKey = "tenant.settings.edit";

const ROW_KEY: PermissionKey = "catalogue.edit";
const COLUMN_KEYS: Record<"events" | "packages" | "offers" | "addons" | "stageThemes", Record<string, PermissionKey>> = {
  events: { mediaKey: "tenant.settings.edit" },
  packages: { pricePerGuestPaisa: "prices.edit" },
  offers: { discountKind: "prices.edit", discountValue: "prices.edit" },
  addons: { pricePaisa: "prices.edit" },
  stageThemes: { pricePaisa: "prices.edit" },
};

type Json = Record<string, unknown>;

// Same comparison as jsonb equality: key order does not matter and an undefined key counts as absent.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, x]) => [k, canon(x)]),
        )
      : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Removes `path` from `obj` in place and returns what was there (like jsonb `#>` then `#-`). */
function take(obj: unknown, path: string[]): unknown {
  const parent = path.slice(0, -1).reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj) as Json | undefined;
  const last = path[path.length - 1];
  const value = parent?.[last];
  if (parent) delete parent[last];
  return value;
}

/** The permission keys needed to turn `before` into `after`, by the same rules the database triggers enforce at publish. */
export function requiredKeys(before: SiteDraft, after: SiteDraft): Set<PermissionKey> {
  const keys = new Set<PermissionKey>();

  for (const part of SETTINGS_PARTS) {
    const b = structuredClone(before[part]);
    const a = structuredClone(after[part]);
    for (const f of SETTINGS_FIELDS) if (f.part === part && !same(take(b, f.path), take(a, f.path))) keys.add(f.key);
    if (!same(b, a)) keys.add(SETTINGS_KEY);
  }

  for (const [table, columns] of Object.entries(COLUMN_KEYS) as [keyof typeof COLUMN_KEYS, Record<string, PermissionKey>][]) {
    const old = new Map<string, Json>(before[table].map((r) => [r.id, r]));
    const kept = new Set<string>();
    const rest = (r: Json, skipSample: boolean) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !Object.hasOwn(columns, k) && !(skipSample && k === "sample")));
    for (const row of after[table] as Json[]) {
      const prev = old.get(row.id as string);
      if (!prev) {
        keys.add(ROW_KEY);
        for (const [col, key] of Object.entries(columns)) if (row[col] != null) keys.add(key);
        continue;
      }
      kept.add(row.id as string);
      for (const [col, key] of Object.entries(columns)) if (!same(prev[col], row[col])) keys.add(key);
      // Clearing sample is a side effect of any allowed edit (20261026000250_sample_flag_free.sql).
      const cleared = prev.sample === true && row.sample === false;
      if (!same(rest(prev, cleared), rest(row, cleared))) keys.add(ROW_KEY);
    }
    if ([...old.keys()].some((id) => !kept.has(id))) keys.add(ROW_KEY);
  }

  return keys;
}
