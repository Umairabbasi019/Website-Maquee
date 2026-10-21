"use client";
import { useSyncExternalStore, type ComponentProps } from "react";
import type { MediaView } from "@/modules/media";
import { pickImageSize, type ImageSize } from "./image";

type Props = { media?: MediaView; focus?: string } & Omit<ComponentProps<"div">, "role" | "aria-label">;

const subscribe = (cb: () => void) => {
  addEventListener("resize", cb);
  return () => removeEventListener("resize", cb);
};
const viewport = () => `${Math.max(innerWidth, innerHeight)}@${devicePixelRatio || 1}`;
// Server HTML (and hydration) assume a 1800 px long side at 1x, which picks the `m` size.
const SERVER_VIEWPORT = "1800@1";

/** Photo as a background. Server HTML uses the `m` size (or nearest); the browser then picks by screen size. */
export function Shot({ media, focus, style, ...rest }: Props) {
  const [longSide, dpr] = useSyncExternalStore(subscribe, viewport, () => SERVER_VIEWPORT).split("@").map(Number);
  const sizes = Object.keys(media?.urls ?? {}) as ImageSize[];
  if (!media || !sizes.length) return null;
  const url = media.urls[pickImageSize(longSide, dpr, sizes)];
  return (
    <div
      role="img"
      aria-label={media.alt}
      style={{ backgroundImage: `url("${url}")`, backgroundPosition: focus, ...style }}
      {...rest}
    />
  );
}
