"use client";
import { clamp, usePin } from "../shared/motion";

// Mockup timing: push in on the front photo, cross to the hall at .4-.49, the hall settles, then a slow drift.
export function HeroMotion() {
  usePin("hero", (p, el) => {
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
  return null;
}
