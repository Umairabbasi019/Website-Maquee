import type { ComponentProps } from "react";
import type { MediaView } from "@/modules/media";
import { coverSizes, srcSet } from "./image";

type Props = { media?: MediaView; focus?: string; priority?: boolean } & Omit<ComponentProps<"img">, "src" | "srcSet" | "alt">;

/**
 * Photo cover-fitted to its box (callers' CSS sets `object-fit: cover`). The browser picks one size from srcset by `sizes` × its pixel ratio.
 * Default `sizes` fits a full-screen box; pass your own for other boxes. `priority` is for the LCP photo.
 */
export function Shot({ media, focus, priority, style, sizes, ...rest }: Props) {
  const src = media && (media.urls.m ?? media.urls.s ?? media.urls.l);
  if (!media || !src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image is not set up for the venue storage URLs; the sizes are pre-made, so srcset is enough.
    <img
      src={src}
      srcSet={srcSet(media)}
      sizes={sizes ?? coverSizes(media.aspect)}
      alt={media.alt}
      {...(priority ? { fetchPriority: "high" } : { loading: "lazy", decoding: "async" })}
      style={{ objectPosition: focus, ...style }}
      {...rest}
    />
  );
}
