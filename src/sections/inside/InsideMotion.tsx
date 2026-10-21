"use client";
import { clamp, usePin } from "../shared/motion";
import styles from "./inside.module.css";

// Mockup timing generalised from 3 rooms to any count: f runs 0..rooms through the pin.
export function InsideMotion() {
  usePin("inside", (p, el) => {
    const frames = el.querySelectorAll<HTMLElement>(".frame");
    const f = p * frames.length;
    const room = Math.min(frames.length - 1, Math.floor(f + 0.25));
    frames.forEach((frame, i) => {
      const shot = frame.querySelector<HTMLElement>(".shot");
      if (shot) {
        if (i) shot.style.opacity = String(clamp((f - i + 0.25) / 0.5));
        shot.style.transform = `translateX(${(0.5 - clamp((f - i + 0.5) / 2)) * 8}%) scale(1.14)`;
      }
      frame.querySelector(`.${styles.room}`)?.classList.toggle("on", i === room);
    });
    const title = el.querySelector<HTMLElement>(`.${styles.title}`);
    if (title) title.style.opacity = String(clamp(1 - p * 5));
  });
  return null;
}
