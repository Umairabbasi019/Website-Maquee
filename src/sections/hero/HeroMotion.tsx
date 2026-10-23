"use client";
import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import type { MediaView } from "@/modules/media";
import { clamp, prefersReducedMotion, usePin } from "../shared/motion";
import { useAfterIdle } from "../shared/useAfterIdle";
import { shouldUseDepth } from "./depth/shouldUseDepth";

const DepthLayer = dynamic(() => import("./depth/DepthLayer"), { ssr: false });

/** A hero photo that has a depth map; `frame` is the index of the .frame holding it. */
export type DepthShot = { media: MediaView; focus?: string; frame: number };

// Software GL (SwiftShader, llvmpipe) draws on the CPU and drops scroll frames, so it counts as no WebGL2.
function hasWebGL2() {
  const probe = document.createElement("canvas").getContext("webgl2");
  const info = probe?.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(probe!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  probe?.getExtension("WEBGL_lose_context")?.loseContext();
  return probe !== null && !/swiftshader|llvmpipe|software/i.test(renderer);
}

const canAffordDepth = () =>
  shouldUseDepth({
    webgl2: hasWebGL2,
    reducedMotion: prefersReducedMotion(),
    cores: navigator.hardwareConcurrency ?? 0,
    saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    finePointer: matchMedia("(pointer: fine)").matches,
  });

// Mockup timing: push in on the front photo, cross to the hall at .4-.49, the hall settles, then a slow drift.
export function HeroMotion({ depth }: { depth: DepthShot[] }) {
  const progress = useRef(0);
  const readProgress = useCallback(() => progress.current, []);
  usePin("hero", (p, el) => {
    progress.current = p;
    const [front, , hall] = Array.from(el.querySelectorAll(".frame"), (f) => f.querySelector<HTMLElement>(".shot"));
    const push = clamp(p / 0.5);
    const cross = clamp((p - 0.4) / 0.09);
    const settle = clamp((p - 0.4) / 0.28);
    if (front) {
      front.style.transform = `scale(${1 + push * push * 1.1})`;
      front.style.opacity = String(1 - cross);
    }
    if (hall) {
      hall.style.opacity = String(cross);
      hall.style.transform = `scale(${1.35 - 0.35 * (1 - (1 - settle) ** 3) + clamp((p - 0.66) / 0.34) * 0.08})`;
    }
    const caps = el.querySelectorAll<HTMLElement>("[data-at]");
    caps.forEach((c, i) => {
      const next = i + 1 < caps.length ? Number(caps[i + 1].dataset.at) : 1.1;
      c.classList.toggle("on", p >= Number(c.dataset.at) && p < next - 0.05);
    });
  });
  // After first paint and idle, so neither the check nor the layer's chunk touches hydration.
  const layers = useAfterIdle(() => {
    if (!depth.length || !canAffordDepth()) return [];
    const frames = document.getElementById("hero")?.querySelectorAll<HTMLElement>(".frame");
    return depth.flatMap((d) => (frames?.[d.frame] ? [{ ...d, host: frames[d.frame] }] : []));
  });
  return layers?.map((l) => <DepthLayer key={l.media.key} media={l.media} focus={l.focus} host={l.host} progress={readProgress} />);
}
