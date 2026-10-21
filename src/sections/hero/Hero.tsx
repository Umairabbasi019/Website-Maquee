import type { CSSProperties } from "react";
import { Caption } from "../shared/Caption";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import styles from "./hero.module.css";
import { HeroMotion } from "./HeroMotion";

/** Arrival: push in on the front photo, cross into the hall, captions at 0 / .2 / .58 of the pin. */
export function Hero({ site }: SectionProps) {
  const { front, hall, captions } = site.content.hero;
  const { arrival, doors } = captions;
  const frontShot = (className: string) => (
    <Shot media={site.media[front.key]} focus={front.focus} className={className} style={{ transformOrigin: front.focus }} />
  );

  return (
    <div id="hero" className="pin" style={{ "--pin": "340vh" } as CSSProperties}>
      <div className="sticky">
        <div className="frame">
          {frontShot("full shot")}
          <div className="shade" />
          <div className={styles.rays} />
          <Caption caption={arrival} as="h1" className={styles.low} data-at="0">
            <div className={`fade ${styles.acts}`}>
              {site.sections.includes("contact") && (
                <a className="pill" href="#contact">
                  {arrival.primaryCta}
                </a>
              )}
              {site.sections.includes("inside") && (
                <a className="pill ghost" href="#inside">
                  {arrival.secondaryCta}
                </a>
              )}
            </div>
          </Caption>
          <div className={styles.cue} />
        </div>
        {/* The doors caption gets its own frame of the front photo when scenes are stacked; pinned, this copy stays hidden. */}
        <div className="frame">
          {frontShot("full")}
          <div className="shade" />
          <Caption caption={doors} as="h2" className={styles.high} data-at="0.2" />
        </div>
        <div className="frame">
          <Shot media={site.media[hall.key]} focus={hall.focus} className="full shot" style={{ transformOrigin: hall.focus }} />
          <div className="shade" />
          <Caption caption={captions.hall} as="h2" className={styles.low} data-at="0.58" />
        </div>
        <div className="dip" />
      </div>
      <HeroMotion />
    </div>
  );
}
