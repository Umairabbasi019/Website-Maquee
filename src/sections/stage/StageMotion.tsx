"use client";
import { clamp, usePin } from "../shared/motion";
import styles from "./stage.module.css";

// Mockup timing: the circle opens from 35% to 115% over .1-.7 of the pin; the caption comes up after .55.
export function StageMotion() {
  usePin("stage", (p, el) => {
    const on = p > 0.55;
    const reveal = el.querySelector<HTMLElement>(`.${styles.reveal}`);
    if (reveal) {
      reveal.style.setProperty("--r", `${35 + clamp((p - 0.1) / 0.6) * 80}%`);
      reveal.style.transform = `scale(${1.06 - p * 0.06})`;
      reveal.style.filter = on ? "brightness(.62)" : "none";
    }
    el.querySelector<HTMLElement>(`.${styles.scrim}`)!.style.opacity = on ? "1" : "0";
    el.querySelector(`.${styles.cap}`)!.classList.toggle("on", on);
  });
  return null;
}
