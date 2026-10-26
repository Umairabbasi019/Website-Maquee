import type { MediaSize } from "./server/assets";

// Same formats as the media_assets_key_format and media_assets_ext_known checks (20261025000100_media_key_ext.sql).
export const MEDIA_KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const EXTS = ["jpg", "png", "webp"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Long-side targets of the M2 s/m/l scheme.
const TARGETS: [MediaSize, number][] = [
  ["s", 1280],
  ["m", 1920],
  ["l", 2880],
];

/** The sizes to make from a width × height photo: never upscaled, `s` always, each next size only when the photo is longer than the previous target. */
export function planVariants(width: number, height: number): { size: MediaSize; width: number; height: number }[] {
  const long = Math.max(width, height);
  const plan = [];
  for (const [i, [size, target]] of TARGETS.entries()) {
    if (i > 0 && long <= TARGETS[i - 1][1]) break;
    const scale = Math.min(target, long) / long;
    plan.push({ size, width: Math.round(width * scale), height: Math.round(height * scale) });
  }
  return plan;
}

/** A new media key: a slug of the file's base name and 6 random hex characters, so two uploads never collide. */
export function mediaKeyFrom(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()!.replace(/\.[^.]*$/, "");
  const slug =
    base
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, 50)
      .replace(/-+$/, "") || "photo";
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${slug}-${hex}`;
}

/** The Storage path of one file of an asset. Every Storage write and delete goes through here, so a path can never leave `<tenantId>/`. */
export function objectPath(tenantId: string, key: string, size: MediaSize | "depth", ext: string): string {
  if (!UUID_RE.test(tenantId)) throw new Error("objectPath: tenant is not a uuid");
  if (!MEDIA_KEY_RE.test(key)) throw new Error("objectPath: bad media key");
  if (!EXTS.includes(ext) || (size === "depth" && ext !== "png")) throw new Error("objectPath: bad extension");
  return `${tenantId}/${key}/${size}.${ext}`;
}
