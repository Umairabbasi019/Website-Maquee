"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion, useReveal, useScrollFrame } from "@/sections/shared/motion";
import { t } from "@/ui/i18n";
import styles from "./site.module.css";

type Props = { brand: string; cta?: string; logo?: { url: string }; links: { href: string; label: string }[] };
type Mote = { x: number; y: number; r: number; v: number; a: number };

// 80 motes on a 1440x900 screen; smaller screens get fewer at the same density (never under 30).
const MOTES = 80;
const MOTE_AREA = 1440 * 900;
// The dust drifts slowly, so 30 redraws a second look the same as 60 at half the main-thread cost.
const DUST_FRAME_MS = 1000 / 30;
const noSubscription = () => () => {};
// Keep in step with the menu breakpoint in site.module.css.
const PHONE_MENU = "(max-width: 860px)";
const MENU_ID = "site-menu";

/** Fixed overlays (letterbox, grain, light leak, dust) and the top nav. Client-only behaviour: scroll state, menu, dust. */
export function ShellChrome({ brand, cta, logo, links }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawDust = useRef<(steps: number) => void>(undefined);
  const sinceDraw = useRef(0);
  const linksBox = useRef<HTMLDivElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  // False in server HTML, true once hydrated: the menu button and its collapsed links only apply when JavaScript runs.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 40);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  // The open phone menu covers the page: focus moves into it, the page behind is inert, Escape closes it and returns focus
  // to the button. Widening past the breakpoint closes it, since CSS no longer shows it there.
  useEffect(() => {
    if (!menuOpen) return;
    const page = document.querySelector("main");
    if (page) page.inert = true;
    linksBox.current?.querySelector("a")?.focus();
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      menuBtn.current?.focus();
    };
    const phone = matchMedia(PHONE_MENU);
    addEventListener("keydown", onKey);
    phone.addEventListener("change", close);
    return () => {
      if (page) page.inert = false;
      removeEventListener("keydown", onKey);
      phone.removeEventListener("change", close);
    };
  }, [menuOpen]);

  // The motes live inside this effect and are moved in place each draw, so drawing allocates nothing.
  useEffect(() => {
    const cv = canvas.current;
    const cx = cv?.getContext("2d");
    if (!cv || !cx || prefersReducedMotion()) return;
    let colour = "";
    let motes: Mote[] = [];
    const size = () => {
      cv.width = innerWidth;
      cv.height = innerHeight;
      colour = getComputedStyle(cv).getPropertyValue("--color-accent").trim();
      const count = Math.max(30, Math.round((MOTES * Math.min(MOTE_AREA, innerWidth * innerHeight)) / MOTE_AREA));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: Math.random() * 1.8 + 0.3,
        v: Math.random() * 0.3 + 0.05,
        a: Math.random() * 0.5 + 0.1,
      }));
    };
    drawDust.current = (steps) => {
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.fillStyle = colour;
      for (const p of motes) {
        p.y -= p.v * steps;
        if (p.y < 0) p.y = innerHeight;
        p.x += Math.sin(p.y / 60) * 0.2 * steps;
        cx.globalAlpha = p.a;
        cx.beginPath();
        cx.arc(p.x, p.y, p.r, 0, 7);
        cx.fill();
      }
    };
    size();
    addEventListener("resize", size);
    return () => {
      removeEventListener("resize", size);
      drawDust.current = undefined;
    };
  }, []);

  useScrollFrame((dt) => {
    sinceDraw.current += dt;
    if (sinceDraw.current < DUST_FRAME_MS) return;
    drawDust.current?.(sinceDraw.current / (1000 / 60)); // move as far as 60 fps would have
    sinceDraw.current = 0;
  });

  return (
    <div className={styles.chrome} data-scrolled={scrolled} data-menu={menuOpen} data-js={hydrated}>
      <div className={`${styles.lb} ${styles.top}`} />
      <div className={`${styles.lb} ${styles.bottom}`} />
      <div className={styles.grain} />
      <div className={styles.leak} />
      <canvas ref={canvas} className={styles.dust} aria-hidden="true" />
      <nav className={styles.nav} aria-label={t("site.navMain")}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- venue logo from storage, remote host not configured for next/image */}
          {logo && <img src={logo.url} alt="" width={30} height={30} />}
          {brand}
        </div>
        <div ref={linksBox} id={MENU_ID} className={styles.links}>
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
        </div>
        <div className={styles.actions}>
          {cta && (
            <a className={styles.pill} href="#contact" onClick={() => setMenuOpen(false)}>
              {cta}
            </a>
          )}
          <button
            ref={menuBtn}
            type="button"
            className={styles.menuBtn}
            aria-controls={MENU_ID}
            aria-label={t(menuOpen ? "site.menuClose" : "site.menuOpen")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <i />
            <i />
          </button>
        </div>
      </nav>
    </div>
  );
}
