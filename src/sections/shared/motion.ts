"use client";
import { useEffect, useRef } from "react";

export const clamp = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// One requestAnimationFrame loop for the whole page. It runs only while someone subscribes, the tab is visible
// and motion is allowed.
const subscribers = new Set<(dt: number) => void>();
let raf = 0;
let last = 0;

function tick(now: number) {
  const dt = now - last;
  last = now;
  subscribers.forEach((cb) => cb(dt));
  raf = requestAnimationFrame(tick);
}

function sync() {
  const shouldRun = subscribers.size > 0 && !document.hidden && !prefersReducedMotion();
  if (shouldRun && !raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  } else if (!shouldRun && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function useScrollFrame(cb: (dt: number) => void) {
  const latest = useRef(cb);
  useEffect(() => {
    latest.current = cb;
  });
  useEffect(() => {
    const run = (dt: number) => latest.current(dt);
    subscribers.add(run);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      subscribers.delete(run);
      document.removeEventListener("visibilitychange", sync);
      sync();
    };
  }, []);
}

/** One easing step from `from` toward `target`. Snaps onto the target once close, so a settled pin repeats the exact same value. */
export function easeToward(from: number, target: number): number {
  const next = lerp(from, target, 0.09);
  return Math.abs(target - next) < 1e-4 ? target : next;
}

const smoothed: Record<string, number> = {};

/** 0..1 progress through a pinned section, eased toward the scroll position for the heavy camera feel. */
export function smoothedProgress(id: string, el: HTMLElement): number {
  const target = clamp(-el.getBoundingClientRect().top / (el.offsetHeight - innerHeight));
  if (prefersReducedMotion()) return target;
  return (smoothed[id] = easeToward(smoothed[id] ?? target, target));
}

/** A ref that is true while #id is within one viewport height of the screen. */
function useNearViewport(id: string) {
  const near = useRef(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (near.current = e.isIntersecting), { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return near;
}

/**
 * Calls `frame` with the smoothed progress through the pinned section #id, and fades its dip at the end.
 * Does nothing while the section is far off screen, and writes nothing once the progress has settled.
 */
export function usePin(id: string, frame: (progress: number, el: HTMLElement) => void) {
  const near = useNearViewport(id);
  const drawn = useRef<number>(undefined);
  useScrollFrame(() => {
    const el = near.current && document.getElementById(id);
    if (!el) return;
    const p = smoothedProgress(id, el);
    if (p === drawn.current) return;
    drawn.current = p;
    frame(p, el);
    const dip = el.querySelector<HTMLElement>(".dip");
    if (dip) dip.style.opacity = String(clamp((p - 0.9) * 10) * 0.55);
  });
}

/** Adds `on` to every [data-r] element the first time 15% of it is in view. */
export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("on");
          io.unobserve(e.target);
        }),
      { threshold: 0.15 },
    );
    document.querySelectorAll("[data-r]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
