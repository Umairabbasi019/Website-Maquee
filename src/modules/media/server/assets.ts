import "server-only";
import { createServiceClient } from "@/modules/access";

export type MediaSize = "s" | "m" | "l";

export type MediaView = {
  key: string;
  alt: string;
  urls: Partial<Record<MediaSize, string>>;
  /** Pixel width of each size, for srcset; a size without a known width is left out of srcset. */
  widths: Partial<Record<MediaSize, number>>;
  /** Width / height of the picture, when known. */
  aspect?: number;
  depthUrl?: string;
};

const SIZES: MediaSize[] = ["s", "m", "l"];

/** A stored [width, height] pair; anything else (missing, zero, malformed) counts as unknown. */
const isDims = (d: unknown): d is [number, number] =>
  Array.isArray(d) && d.length === 2 && d.every((n) => typeof n === "number" && n > 0);

/** Public media for one tenant, keyed by media key. Service client bypasses RLS, so the query is filtered by tenantId. */
export async function getPublicMedia(tenantId: string): Promise<Record<string, MediaView>> {
  const { data, error } = await createServiceClient()
    .from("media_assets")
    .select("key, alt, sizes, ext, dims")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`media_assets: ${error.message}`);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/${tenantId}`;
  return Object.fromEntries(
    data.map((r) => {
      const sizes = SIZES.filter((s) => r.sizes.includes(s));
      const known = sizes.flatMap((s) => {
        const d: unknown = r.dims[s];
        return isDims(d) ? [[s, d] as const] : [];
      });
      const view: MediaView = {
        key: r.key,
        alt: r.alt,
        urls: Object.fromEntries(sizes.map((s) => [s, `${base}/${r.key}/${s}.${r.ext}`])),
        widths: Object.fromEntries(known.map(([s, [w]]) => [s, w])),
      };
      if (known.length) view.aspect = known[0][1][0] / known[0][1][1];
      if (r.sizes.includes("depth")) view.depthUrl = `${base}/${r.key}/depth.png`;
      return [r.key, view];
    }),
  );
}
