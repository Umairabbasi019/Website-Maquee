"use server";
import { z } from "zod";
import { ForbiddenError } from "@/modules/access";
import { discardDraft, DraftChangeSchema, DraftError, publishDraft, saveDraftChange, type DraftChange } from "@/modules/editor";
import type { TranslationKey } from "@/ui/i18n/en";
import { getDashboard } from "../context";

type Result = { ok: true } | { error: TranslationKey; items?: string[] };

const RevisionSchema = z.int().positive();

const PUBLISH_ERRORS = {
  siteChanged: "editor.siteChanged",
  blocked: "editor.blocked",
  invalid: "editor.invalid",
  eventHasDatePrices: "editor.eventHasDatePrices",
} as const satisfies Record<string, TranslationKey>;

// The venue only ever comes from the dashboard session, never from an argument.
async function venueId(): Promise<string | null> {
  return (await getDashboard()).venue?.id ?? null;
}

async function save(change: DraftChange): Promise<Result> {
  const tenantId = await venueId();
  if (!tenantId) return { error: "editor.noVenue" };
  try {
    await saveDraftChange(tenantId, change);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "editor.forbidden" };
    if (e instanceof DraftError) return { error: e.code === "busy" ? "editor.busy" : "editor.badChange" };
    // The change applied but the draft it made fails SiteDraftSchema.
    if (e instanceof z.ZodError) return { error: "editor.badChange" };
    throw e;
  }
}

export async function saveChange(change: unknown): Promise<Result> {
  const parsed = DraftChangeSchema.safeParse(change);
  return parsed.success ? save(parsed.data) : { error: "editor.badChange" };
}

/** Super admin: the site-wide copy is no longer sample (tenant.settings.edit, checked like any other change). */
export async function markContentReal(): Promise<Result> {
  return save({ kind: "settings", part: "content", path: ["sample"], value: false });
}

export async function publish(revision: number): Promise<Result> {
  const parsed = RevisionSchema.safeParse(revision);
  if (!parsed.success) return { error: "editor.siteChanged" };
  const tenantId = await venueId();
  if (!tenantId) return { error: "editor.noVenue" };
  try {
    const result = await publishDraft(tenantId, parsed.data);
    return "ok" in result ? result : { error: PUBLISH_ERRORS[result.error], items: result.items };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "editor.forbidden" };
    throw e;
  }
}

export async function discard(revision: number): Promise<Result> {
  const parsed = RevisionSchema.safeParse(revision);
  if (!parsed.success) return { error: "editor.siteChanged" };
  const tenantId = await venueId();
  if (!tenantId) return { error: "editor.noVenue" };
  try {
    const result = await discardDraft(tenantId, parsed.data);
    return "ok" in result ? result : { error: PUBLISH_ERRORS[result.error] };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "editor.forbidden" };
    throw e;
  }
}
