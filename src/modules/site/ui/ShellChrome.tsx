"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion, useReveal, useScrollFrame } from "@/sections/shared/motion";
import { t } from "@/ui/i18n";
import styles from "./site.module.css";

type Props = { brand: string; cta?: string; logo?: { url: string }; links: { href: string; label: string }[] };
type Mote = { x: number; y: number; r: number; v: number; a: number };

const MOTES = 80;
const noSubscription = () => () => {};

/** Fixed overlays (letterbox, grain, light leak, dust) and the top nav. Client-only behaviour: scroll state, menu, dust. */
export function ShellChrome({ brand, cta, logo, links }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motes = useRef<Mote[]>([]);
  const colour = useRef("");

  // False in server HTML, true once hydrated: the menu button and its collapsed links only apply when JavaScript runs.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 40);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || prefersReducedMotion()) return;
    const size = () => {
      cv.width = innerWidth;
      cv.height = innerHeight;
      colour.current = getComputedStyle(cv).getPropertyValue("--color-accent").trim();
      motes.current = Array.from({ length: MOTES }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: Math.random() * 1.8 + 0.3,
        v: Math.random() * 0.3 + 0.05,
        a: Math.random() * 0.5 + 0.1,
      }));
    };
    size();
    addEventListener("resize", size);
    return () => removeEventListener("resize", size);
  }, []);

  useScrollFrame(() => {
    const cv = canvas.current;
    const cx = cv?.getContext("2d");
    if (!cv || !cx) return;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.fillStyle = colour.current;
    motes.current = motes.current.map((p) => {
      const y = p.y - p.v < 0 ? innerHeight : p.y - p.v;
      const next = { ...p, y, x: p.x + Math.sin(y / 60) * 0.2 };
      cx.globalAlpha = p.a;
      cx.beginPath();
      cx.arc(next.x, next.y, p.r, 0, 7);
      cx.fill();
      return next;
    });
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
        <div className={styles.links}>
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
            type="button"
            className={styles.menuBtn}
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
