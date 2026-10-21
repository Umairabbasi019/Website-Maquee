"use client";
import { useScrollFrame } from "../shared/motion";
import styles from "./gallery.module.css";

// Mockup drift: gx runs 0..1 while the section crosses the viewport; the rows slide 30% in opposite directions.
export function GalleryMotion() {
  useScrollFrame(() => {
    const el = document.getElementById("gallery");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gx = (innerHeight - r.top) / (innerHeight + r.height);
    if (gx < 0 || gx > 1) return; // off screen: skip the style writes
    el.querySelector<HTMLElement>(`.${styles.r1}`)?.style.setProperty("transform", `translateX(${-gx * 30}%)`);
    el.querySelector<HTMLElement>(`.${styles.r2}`)?.style.setProperty("transform", `translateX(${-50 + gx * 30}%)`);
  });
  return null;
}
