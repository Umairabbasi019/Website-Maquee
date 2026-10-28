import "server-only";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import { can, createServiceClient, ForbiddenError, recordAudit, requirePerm, type Viewer } from "@/modules/access";
import { MEDIA_KEY_RE, mediaKeyFrom, objectPath, planVariants } from "../variants";
import { isDims, type MediaSize } from "./assets";

const BUCKET = "venue-media";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const CACHE = "31536000"; // a key is never reused for other pixels, so files can be cached for a year
const CONTENT_TYPE = { jpg: "image/jpeg", png: "image/png" } as const;

export const MEDIA_CATEGORIES = ["gallery", "stage", "event", "room", "hero", "logo", "seo"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];
// Hero, logo and search-preview photos belong to the super admin's parts of the site.
const SETTINGS_CATEGORIES: MediaCategory[] = ["hero", "logo", "seo"];

const AltSchema = z.string().trim().min(1).max(250);

type Format = "jpeg" | "png" | "webp";
export type ImageError = "type" | "tooLarge" | "tooManyPixels" | "animated";
export type Variant = { size: MediaSize; width: number; height: number; data: Buffer };

/** The categories this viewer may upload into. */
export const categoriesFor = (viewer: Viewer, tenantId: string): MediaCategory[] =>
  MEDIA_CATEGORIES.filter((c) => !SETTINGS_CATEGORIES.includes(c) || can(viewer, tenantId, "tenant.settings.edit"));

// Magic bytes, checked before any decoder sees the file, so libvips never parses SVG, TIFF, HEIF and the like.
function sniff(b: Buffer): Format | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Reads the header only: size, real format, pixel count and frame count are checked before any pixels are decoded. */
async function inspect(
  bytes: Buffer,
  formats: Format[],
  maxBytes = MAX_BYTES,
): Promise<{ meta: Metadata & { width: number; height: number } } | { error: ImageError }> {
  if (bytes.length > maxBytes) return { error: "tooLarge" };
  const format = sniff(bytes);
  if (!format || !formats.includes(format)) return { error: "type" };
  let meta: Metadata;
  try {
    // Header only, no pixels decoded; the limit is off so an oversized image reaches the pixel check below.
    meta = await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch {
    return { error: "type" };
  }
  const { width, height } = meta;
  if (meta.format !== format || !width || !height) return { error: "type" };
  if (width * height > MAX_PIXELS) return { error: "tooManyPixels" };
  if ((meta.pages ?? 1) > 1) return { error: "animated" };
  return { meta: { ...meta, width, height } };
}

/** The same checks for a JPEG, PNG or WebP that is only stored (a payment receipt), with the caller's own size limit. */
export const checkImage = (bytes: Buffer, maxBytes: number) => inspect(bytes, ["jpeg", "png", "webp"], maxBytes);

/** Checks an uploaded file and makes its size variants: upright, metadata stripped, PNG only when it has transparency. */
export async function processUpload(bytes: Buffer): Promise<{ ext: "jpg" | "png"; variants: Variant[] } | { error: ImageError }> {
  const checked = await inspect(bytes, ["jpeg", "png", "webp"]);
  if ("error" in checked) return checked;
  const { meta } = checked;
  const ext = meta.format === "png" && meta.hasAlpha ? "png" : "jpg";
  // EXIF orientations 5–8 turn the picture a quarter turn.
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const source = sharp(bytes, { limitInputPixels: MAX_PIXELS }).rotate();
  try {
    // One size at a time keeps only one decoded copy in memory.
    const variants: Variant[] = [];
    for (const v of planVariants(w, h)) {
      const out = source.clone().resize(v.width, v.height);
      const data = await (ext === "png" ? out.png() : out.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true })).toBuffer();
      variants.push({ ...v, data });
    }
    return { ext, variants };
  } catch {
    return { error: "type" }; // a valid header over corrupt pixel data
  }
}

type AssetRow = { id: string; key: string; alt: string; category: MediaCategory; sizes: (MediaSize | "depth")[]; ext: "jpg" | "png" | "webp"; dims: Record<string, unknown> };

async function findAsset(tenantId: string, key: string): Promise<AssetRow | null> {
  if (!MEDIA_KEY_RE.test(key)) return null;
  const { data, error } = await createServiceClient()
    .from("media_assets")
    .select("id, key, alt, category, sizes, ext, dims")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle<AssetRow>();
  if (error) throw new Error(`media_assets: ${error.message}`);
  return data;
}

const filePath = (tenantId: string, a: Pick<AssetRow, "key" | "ext">, size: MediaSize | "depth") =>
  objectPath(tenantId, a.key, size, size === "depth" ? "png" : a.ext);

const KEY_TRIES = 5;

/** A new key no asset of this venue has yet. The random part makes a clash rare; the insert's unique (tenant_id, key) still guards a race. */
async function freeKey(tenantId: string, fileName: string): Promise<string> {
  for (let i = 0; i < KEY_TRIES; i++) {
    const key = mediaKeyFrom(fileName);
    if (!(await findAsset(tenantId, key))) return key;
  }
  throw new Error("media: no free key after several tries");
}

export type UploadResult = { key: string } | { error: ImageError | "alt" | "category" | "notFound" };

/** Stores a new photo for the venue under a key made here; nothing about the path comes from the browser. */
export async function uploadMedia(tenantId: string, file: File, input: { alt: string; category: string }): Promise<UploadResult> {
  const viewer = await requirePerm(tenantId, "media.manage");
  const alt = AltSchema.safeParse(input.alt);
  if (!alt.success) return { error: "alt" };
  const category = z.enum(MEDIA_CATEGORIES).safeParse(input.category);
  if (!category.success) return { error: "category" };
  if (!categoriesFor(viewer, tenantId).includes(category.data)) throw new ForbiddenError();

  if (file.size > MAX_BYTES) return { error: "tooLarge" };

  const processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  if ("error" in processed) return processed;
  const { ext, variants } = processed;
  const key = await freeKey(tenantId, file.name);
  const db = createServiceClient();
  // Only files this call wrote are removed on failure; a path that already exists makes upload fail, and its files are someone else's.
  const written: string[] = [];
  let id: string;
  try {
    for (const v of variants) {
      const path = objectPath(tenantId, key, v.size, ext);
      const { error } = await db.storage.from(BUCKET).upload(path, v.data, { contentType: CONTENT_TYPE[ext], cacheControl: CACHE });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
      written.push(path);
    }
    const { data, error } = await db
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        key,
        alt: alt.data,
        category: category.data,
        sizes: variants.map((v) => v.size),
        dims: Object.fromEntries(variants.map((v) => [v.size, [v.width, v.height]])),
        ext,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) throw new Error(`media_assets: ${error.message}`);
    id = data.id;
  } catch (e) {
    if (written.length) await db.storage.from(BUCKET).remove(written);
    throw e;
  }
  await recordAudit({ tenantId, action: "media.upload", entity: "media_asset", entityId: id, after: { key, alt: alt.data, category: category.data } });
  return { key };
}

/** Uploads a new photo carrying the old one's alt text and category. Swapping the draft's references is the caller's job. */
export async function replaceMedia(tenantId: string, oldKey: string, file: File): Promise<UploadResult> {
  await requirePerm(tenantId, "media.manage");
  const old = await findAsset(tenantId, oldKey);
  if (!old) return { error: "notFound" };
  return uploadMedia(tenantId, file, { alt: old.alt, category: old.category });
}

export async function setAlt(tenantId: string, key: string, alt: string): Promise<{ ok: true } | { error: "alt" | "notFound" }> {
  await requirePerm(tenantId, "media.manage");
  const parsed = AltSchema.safeParse(alt);
  if (!parsed.success) return { error: "alt" };
  const old = await findAsset(tenantId, key);
  if (!old) return { error: "notFound" };
  const { error } = await createServiceClient().from("media_assets").update({ alt: parsed.data }).eq("id", old.id);
  if (error) throw new Error(`media_assets: ${error.message}`);
  await recordAudit({ tenantId, action: "media.alt", entity: "media_asset", entityId: old.id, before: { alt: old.alt }, after: { alt: parsed.data } });
  return { ok: true };
}

/** Deletes a photo nobody uses. `usedIn` is where the published site and the draft use it (the editor module knows that, not this one). */
export async function deleteMedia(
  tenantId: string,
  key: string,
  usedIn: string[],
): Promise<{ ok: true } | { error: "inUse"; usedIn: string[] } | { error: "notFound" }> {
  await requirePerm(tenantId, "media.manage");
  if (usedIn.length) return { error: "inUse", usedIn };
  const old = await findAsset(tenantId, key);
  if (!old) return { error: "notFound" };
  const db = createServiceClient();
  const { error } = await db.from("media_assets").delete().eq("id", old.id);
  if (error) throw new Error(`media_assets: ${error.message}`);
  // The row is gone, so nothing can point at the files any more; a failed removal only leaves orphans behind.
  const removed = await db.storage.from(BUCKET).remove(old.sizes.map((s) => filePath(tenantId, old, s)));
  if (removed.error) console.error(`media delete ${tenantId}/${key}: ${removed.error.message}`);
  await recordAudit({ tenantId, action: "media.delete", entity: "media_asset", entityId: old.id, before: { key, alt: old.alt, category: old.category, sizes: old.sizes } });
  return { ok: true };
}

/** Super admin: a depth map (PNG, made offline with tools/depth.py) for a photo, matching its shape within 1 %. */
export async function uploadDepth(
  tenantId: string,
  key: string,
  file: File,
): Promise<{ ok: true } | { error: ImageError | "notFound" | "aspect" }> {
  await requirePerm(tenantId, "tenant.settings.edit");
  if (file.size > MAX_BYTES) return { error: "tooLarge" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = await inspect(bytes, ["png"]);
  if ("error" in checked) return checked;
  const old = await findAsset(tenantId, key);
  if (!old) return { error: "notFound" };
  const ref = [old.dims.m, old.dims.l, old.dims.s].find(isDims);
  const { width, height } = checked.meta;
  if (!ref || Math.abs(width / height / (ref[0] / ref[1]) - 1) > 0.01) return { error: "aspect" };

  const db = createServiceClient();
  const data = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).png().toBuffer();
  const path = filePath(tenantId, old, "depth");
  const up = await db.storage.from(BUCKET).upload(path, data, { contentType: CONTENT_TYPE.png, cacheControl: CACHE, upsert: true });
  if (up.error) throw new Error(`upload ${path}: ${up.error.message}`);
  const sizes = old.sizes.includes("depth") ? old.sizes : [...old.sizes, "depth"];
  const { error } = await db
    .from("media_assets")
    // depthVersion goes into the public URL (assets.ts), so an overwritten depth.png is fetched fresh.
    .update({ sizes, dims: { ...old.dims, depth: [width, height], depthVersion: Date.now() } })
    .eq("id", old.id);
  if (error) throw new Error(`media_assets: ${error.message}`);
  await recordAudit({ tenantId, action: "media.depth", entity: "media_asset", entityId: old.id, after: { key, dims: [width, height] } });
  return { ok: true };
}
