import type { CSSProperties } from "react";
import { Caption } from "../shared/Caption";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import styles from "./hero.module.css";
import { HeroMotion, type DepthShot } from "./HeroMotion";

/** Arrival: push in on the front photo, cross into the hall, captions at 0 / .2 / .58 of the pin. */
export function Hero({ site }: SectionProps) {
  const { front, hall, captions } = site.content.hero;
  const { arrival, doors } = captions;
  // Frames 0 and 2 hold the front and hall photos; frame 1 is the stacked doors copy, hidden while pinned.
  const depth: DepthShot[] =
    site.content.hero.mode === "depth"
      ? [
          { ref: front, frame: 0 },
          { ref: hall, frame: 2 },
        ].flatMap(({ ref, frame }) => {
          const media = site.media[ref.key];
          return media?.depthUrl ? [{ media, focus: ref.focus, frame }] : [];
        })
      : [];
  const frontShot = (className: string, first: boolean) => (
    <Shot
      media={site.media[front.key]}
      focus={front.focus}
      className={className}
      style={{ transformOrigin: front.focus }}
      priority={first}
      decorative={!first}
    />
  );

  return (
    <div id="hero" className="pin" style={{ "--pin": "340vh" } as CSSProperties}>
      <div className="sticky">
        <div className="frame">
          {frontShot("full shot", true)}
          <div className="shade" />
          <div className={styles.rays} />
          <Caption caption={arrival} as="h1" className={`${styles.low} ${styles.arrive} on`} data-at="0">
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
          {frontShot("full", false)}
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
      <HeroMotion depth={depth} />
    </div>
  );
}
