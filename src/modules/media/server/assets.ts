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
      const dims: Partial<Record<MediaSize, [number, number]>> = r.dims;
      const known = sizes.filter((s) => dims[s]);
      const view: MediaView = {
        key: r.key,
        alt: r.alt,
        urls: Object.fromEntries(sizes.map((s) => [s, `${base}/${r.key}/${s}.${r.ext}`])),
        widths: Object.fromEntries(known.map((s) => [s, dims[s]![0]])),
      };
      if (known.length) view.aspect = dims[known[0]]![0] / dims[known[0]]![1];
      if (r.sizes.includes("depth")) view.depthUrl = `${base}/${r.key}/depth.png`;
      return [r.key, view];
    }),
  );
}
