import type { MediaView } from "@/modules/media";

/** srcset with w descriptors for every size whose pixel width is known. */
export const srcSet = ({ urls, widths }: MediaView) =>
  (Object.keys(widths) as (keyof MediaView["widths"])[])
    .filter((s) => urls[s])
    .map((s) => `${urls[s]} ${widths[s]}w`)
    .join(", ") || undefined;

/**
 * sizes for a picture cover-fitted into a box `width` wide and `vh` tall: a picture wider than the box
 * is drawn at its aspect × the box height, so it needs that many CSS pixels, not the box width.
 */
export const coverSizes = (aspect: number | undefined, width = "100vw", vh = 100) =>
  aspect ? `max(${width}, ${Math.ceil(aspect * vh)}vh)` : width;
