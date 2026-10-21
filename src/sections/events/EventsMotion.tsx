"use client";
import { useRef } from "react";
import { usePin } from "../shared/motion";
import styles from "./events.module.css";

// Mockup: the active event is floor(progress × count); only a change of event touches the DOM.
export function EventsMotion() {
  const last = useRef(-1);
  usePin("events", (p, el) => {
    const frames = el.querySelectorAll<HTMLElement>(".frame");
    const active = Math.min(frames.length - 1, Math.floor(p * frames.length));
    if (active === last.current) return;
    last.current = active;
    frames.forEach((frame, i) => {
      const on = i === active;
      const bg = frame.querySelector<HTMLElement>(`.${styles.bg}`);
      if (bg) {
        bg.style.opacity = on ? "1" : "0";
        bg.style.transform = on ? "scale(1)" : "scale(1.12)";
      }
      const note = frame.querySelector<HTMLElement>(`.${styles.note}`)!;
      note.classList.toggle("on", on);
      note.style.visibility = on ? "visible" : "hidden"; // stacked notes: only the active one takes clicks and focus
    });
    const list = el.querySelector(`.${styles.list}`)!;
    list.classList.add(styles.pinned);
    list.querySelectorAll("li").forEach((li, i) => li.classList.toggle(styles.active, i === active));
  });
  return null;
}
