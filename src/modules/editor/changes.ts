import { z } from "zod";
import { ROW_VALUE_SCHEMAS } from "@/modules/catalogue/client";
import { ROW_TABLES, SETTINGS_PARTS, SiteDraftSchema, type RowKind, type SettingsPart, type SiteDraft } from "./draft";
import { mediaRefs } from "./media-usage";

export class DraftError extends Error {
  constructor(readonly code: "unknownItem" | "badPath" | "busy") {
    super(code);
    this.name = "DraftError";
  }
}

const rowChange = <K extends RowKind, S extends z.ZodType>(kind: K, value: S) =>
  z.object({ kind: z.literal(kind), id: z.uuid(), value: value.nullable() });

const MediaKey = z.string().min(1);

/** One editor save. A row `value` of null removes the row; settings `path` points inside the part (empty: the whole part). */
export const DraftChangeSchema = z.discriminatedUnion("kind", [
  rowChange("event", ROW_VALUE_SCHEMAS.event),
  rowChange("package", ROW_VALUE_SCHEMAS.package),
  rowChange("offer", ROW_VALUE_SCHEMAS.offer),
  rowChange("addon", ROW_VALUE_SCHEMAS.addon),
  rowChange("stageTheme", ROW_VALUE_SCHEMAS.stageTheme),
  z.object({
    kind: z.literal("settings"),
    part: z.enum(SETTINGS_PARTS),
    path: z.array(z.string().regex(/^[A-Za-z0-9]+$/)).max(4),
    value: z.unknown(),
  }),
  z.object({ kind: z.literal("swapMedia"), from: MediaKey, to: MediaKey }),
]);

export type DraftChange = z.infer<typeof DraftChangeSchema>;

/** The item a change belongs to, for "who changed it" and the change count. Settings are grouped two levels deep. */
export function itemKey(change: DraftChange): string {
  switch (change.kind) {
    case "settings":
      return `settings:${[change.part, ...change.path.slice(0, 2)].join(".")}`;
    case "swapMedia":
      return `media:${change.from}`;
    default:
      return `${change.kind}:${change.id}`;
  }
}

/** The draft with one change applied; the input is not modified. The result still needs SiteDraftSchema before it is stored. */
export function applyChange(draft: SiteDraft, change: DraftChange): SiteDraft {
  const next = structuredClone(draft);
  switch (change.kind) {
    case "settings":
      setSetting(next, change.part, change.path, change.value);
      break;
    case "swapMedia":
      for (const ref of mediaRefs(next)) if (ref.key === change.from) setAt(next, ref.path, change.to);
      break;
    case "event":
      applyEvent(next, change.id, change.value);
      break;
    default:
      putRow(next[ROW_TABLES[change.kind]], change.id, change.value);
  }
  return next;
}

// An id not in the draft with a value is a new row; the server picks its id (crypto.randomUUID()).
function putRow(rows: { id: string }[], id: string, value: object | null, fixed: object = {}) {
  const i = rows.findIndex((r) => r.id === id);
  if (value === null) {
    if (i < 0) throw new DraftError("unknownItem");
    rows.splice(i, 1);
    return;
  }
  const row = { ...value, ...fixed, id, sample: false };
  if (i < 0) rows.push(row);
  else rows[i] = row;
}

function applyEvent(draft: SiteDraft, id: string, value: z.infer<typeof ROW_VALUE_SCHEMAS.event> | null) {
  const current = draft.events.find((e) => e.id === id);
  if (value === null) {
    putRow(draft.events, id, null);
    draft.packages = draft.packages.filter((p) => p.eventTypeId !== id);
    if (draft.content.packages.defaultEvent === current?.slug) delete draft.content.packages.defaultEvent;
    return;
  }
  // The slug is in public links, so it never changes after create.
  putRow(draft.events, id, value, { slug: current?.slug ?? newSlug(value.name, draft.events) });
}

function newSlug(name: string, events: { slug: string }[]): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "event";
  const taken = new Set(events.map((e) => e.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

// The schema decides which keys exist, so an optional field that is unset can still be set, but no new key can be added.
function childSchema(schema: z.ZodType, seg: string): z.ZodType | undefined {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodDefault) s = s.unwrap() as z.ZodType;
  if (s instanceof z.ZodObject) return Object.hasOwn(s.shape, seg) ? s.shape[seg] : undefined;
  if (s instanceof z.ZodArray && /^\d+$/.test(seg)) return s.element as z.ZodType;
  return undefined;
}

function setSetting(draft: SiteDraft, part: SettingsPart, path: string[], value: unknown) {
  // The whole part, e.g. the sections list, whose order cannot change one item at a time without a duplicate in between.
  if (path.length === 0) {
    (draft as Record<SettingsPart, unknown>)[part] = value;
    return;
  }
  let schema: z.ZodType = SiteDraftSchema.shape[part];
  let holder: unknown = draft[part];
  path.forEach((seg, i) => {
    const child = childSchema(schema, seg);
    const missing = holder === null || typeof holder !== "object" || (Array.isArray(holder) && Number(seg) >= holder.length);
    if (!child || missing) throw new DraftError("badPath");
    const obj = holder as Record<string, unknown>;
    if (i === path.length - 1) obj[seg] = value;
    else {
      holder = obj[seg];
      schema = child;
    }
  });
}

function setAt(root: object, path: (string | number)[], value: unknown) {
  const parent = path.slice(0, -1).reduce<Record<string | number, unknown>>((o, k) => o[k] as Record<string | number, unknown>, root as Record<string, unknown>);
  parent[path[path.length - 1]] = value;
}
