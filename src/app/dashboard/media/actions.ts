"use server";
import { revalidatePath } from "next/cache";
import { ForbiddenError } from "@/modules/access";
import { DraftError, getDraft, mediaUsage, saveDraftChange } from "@/modules/editor";
import { deleteMedia, replaceMedia, setAlt, uploadMedia, type UploadState } from "@/modules/media";
import type { TranslationKey } from "@/ui/i18n";
import { getDashboard } from "../context";
import { mediaUsedIn } from "./usage";

export type ItemState = { ok: TranslationKey } | { error: TranslationKey; usedIn?: string[] } | null;

const ERRORS = {
  type: "media.error.type",
  tooLarge: "media.error.tooLarge",
  tooManyPixels: "media.error.tooManyPixels",
  animated: "media.error.animated",
  alt: "media.error.alt",
  category: "media.error.category",
  notFound: "media.error.notFound",
} as const satisfies Record<string, TranslationKey>;

const fileOf = (fd: FormData) => {
  const f = fd.get("file");
  return f instanceof File && f.size > 0 ? f : null;
};
const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");

// The venue only ever comes from the dashboard session; the browser sends only the photo key it acts on, which the module checks against this venue.
async function inVenue<T>(fn: (tenantId: string) => Promise<T>): Promise<T | { error: TranslationKey }> {
  const tenantId = (await getDashboard()).venue?.id;
  if (!tenantId) return { error: "editor.noVenue" };
  try {
    return await fn(tenantId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "editor.forbidden" };
    throw e;
  }
}

const changed = () => revalidatePath("/dashboard/media");

export async function uploadPhoto(_prev: UploadState, fd: FormData): Promise<UploadState> {
  const file = fileOf(fd);
  if (!file) return { error: "media.error.file" };
  return inVenue(async (tenantId) => {
    const result = await uploadMedia(tenantId, file, { alt: text(fd, "alt"), category: text(fd, "category") });
    if ("error" in result) return { error: ERRORS[result.error] };
    changed();
    return result;
  });
}

/** A new photo with the old alt text; the draft then uses it wherever it used the old one. */
export async function replacePhoto(_prev: ItemState, fd: FormData): Promise<ItemState> {
  const file = fileOf(fd);
  if (!file) return { error: "media.error.file" };
  const from = text(fd, "key");
  return inVenue(async (tenantId) => {
    const result = await replaceMedia(tenantId, from, file);
    if ("error" in result) return { error: ERRORS[result.error] };
    const { draft } = await getDraft(tenantId);
    const used = mediaUsage(draft).has(from);
    if (used) {
      try {
        await saveDraftChange(tenantId, { kind: "swapMedia", from, to: result.key });
      } catch (e) {
        // Nothing uses the new photo yet, so it goes again rather than lingering unexplained.
        await deleteMedia(tenantId, result.key, []);
        if (e instanceof ForbiddenError) return { error: "media.error.swapForbidden" };
        if (e instanceof DraftError && e.code === "busy") return { error: "editor.busy" };
        throw e;
      }
    }
    changed();
    return { ok: used ? "media.replaced" : "media.replacedUnused" };
  });
}

export async function saveAlt(_prev: ItemState, fd: FormData): Promise<ItemState> {
  return inVenue(async (tenantId) => {
    const result = await setAlt(tenantId, text(fd, "key"), text(fd, "alt"));
    if ("error" in result) return { error: ERRORS[result.error] };
    changed();
    return { ok: "media.altSaved" };
  });
}

export async function removePhoto(_prev: ItemState, fd: FormData): Promise<ItemState> {
  const key = text(fd, "key");
  return inVenue(async (tenantId) => {
    const result = await deleteMedia(tenantId, key, (await mediaUsedIn(tenantId)).get(key) ?? []);
    if ("error" in result) {
      return result.error === "inUse" ? { error: "media.error.inUse", usedIn: result.usedIn } : { error: ERRORS[result.error] };
    }
    changed();
    return null;
  });
}
