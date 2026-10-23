"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaView } from "@/modules/media";
import { easeToward, useNearViewport, useScrollFrame } from "../../shared/motion";
import styles from "../hero.module.css";
import { createDepthProgram } from "./shader";

type Props = {
  media: MediaView;
  focus?: string;
  /** The hero frame holding the shot's <img>; the canvas goes on top of it. */
  host: HTMLElement;
  /** Smoothed hero progress, 0..1. */
  progress: () => number;
};

const DPR_CAP = 2;

async function bitmap(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob());
}

// Scrolling down the pin pushes the view down; the pointer adds its own vector. Kept within a unit length.
function paint(draw: ReturnType<typeof createDepthProgram>, c: HTMLCanvasElement, x: number, y: number, p: number) {
  const len = Math.max(1, Math.hypot(x, y + p));
  draw(c.width, c.height, x / len, (y + p) / len);
}

/**
 * Depth parallax over one hero photo. The server <img> stays underneath as the fallback and the LCP element; it is
 * only made transparent once the canvas has faded in, and gets its look back if the layer fails (no context, shader
 * error, image error, context lost), which unmounts the canvas. Scale and opacity are copied from the <img>, which
 * HeroMotion drives, so both follow one timeline.
 */
export default function DepthLayer({ media, focus, host, progress }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef<ReturnType<typeof createDepthProgram>>(undefined);
  const drawn = useRef<number[]>([]);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const near = useNearViewport("hero");
  const [failed, setFailed] = useState(false);
  const img = host.querySelector<HTMLImageElement>("img.shot");

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !media.depthUrl) return;
    const fail = () => setFailed(true);
    const gl = c.getContext("webgl2", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
    const aborts = new AbortController();
    c.addEventListener("webglcontextlost", fail);
    if (gl) {
      const [fx, fy] = focus?.split(" ").map((v) => parseFloat(v) / 100) ?? [0.5, 0.5];
      // currentSrc is the size the browser already picked (and cached) for this screen.
      Promise.all([bitmap(img.currentSrc || img.src, aborts.signal), bitmap(media.depthUrl, aborts.signal)])
        .then(([photo, depth]) => {
          draw.current = createDepthProgram(gl, photo, depth, [fx, fy]);
          photo.close();
          depth.close();
        })
        .catch(() => aborts.signal.aborted || fail());
    } else queueMicrotask(fail); // not a synchronous setState inside the effect

    const resize = new ResizeObserver(() => {
      const dpr = Math.min(devicePixelRatio, DPR_CAP);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      // A resize clears the canvas; repaint now so no blank frame shows before the next tick.
      const [x, y, p] = drawn.current;
      if (draw.current && p !== undefined) paint(draw.current, c, x, y, p);
    });
    resize.observe(c);
    const move = (e: PointerEvent) => {
      // Touch moves come with scrolling, which already drives the shift.
      if (e.pointerType === "touch") return;
      pointer.current.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.current.ty = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener("pointermove", move, { passive: true });
    const hideImg = () => (img.style.filter = "opacity(0)");
    c.addEventListener("animationend", hideImg);
    return () => {
      aborts.abort();
      resize.disconnect();
      removeEventListener("pointermove", move);
      c.removeEventListener("webglcontextlost", fail);
      c.removeEventListener("animationend", hideImg);
      img.style.filter = "";
    };
  }, [img, media.depthUrl, focus]);

  useScrollFrame(() => {
    const c = canvas.current;
    if (!near.current || !draw.current || !c || !img) return;
    const pt = pointer.current;
    pt.x = easeToward(pt.x, pt.tx);
    pt.y = easeToward(pt.y, pt.ty);
    const p = progress();
    const [x, y] = drawn.current;
    if (pt.x === x && pt.y === y && p === drawn.current[2]) return;
    drawn.current = [pt.x, pt.y, p];
    c.style.transform = img.style.transform;
    c.style.opacity = img.style.opacity;
    // Fully faded out (front after the cross, hall before it): nothing to show, so skip the GPU work.
    if (img.style.opacity === "0") return;
    paint(draw.current, c, pt.x, pt.y, p);
    if (!("ready" in c.dataset)) c.dataset.ready = "";
  });
  if (failed || !img) return null;
  return createPortal(<canvas ref={canvas} className={`full shot ${styles.depth}`} style={{ transformOrigin: focus }} aria-hidden />, host);
}
