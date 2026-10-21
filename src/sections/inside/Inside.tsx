import type { CSSProperties } from "react";
import { Caption } from "../shared/Caption";
import { Lines } from "../shared/lines";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import styles from "./inside.module.css";
import { InsideMotion } from "./InsideMotion";

/** One room at a time: the camera pans sideways while rooms dissolve into each other. */
export function Inside({ site }: SectionProps) {
  const { chapter, title, rooms } = site.content.inside;
  return (
    <div id="inside" className="pin" style={{ "--pin": "320vh" } as CSSProperties}>
      <div className="sticky">
        {rooms.map((room, i) => (
          <div className="frame" key={i}>
            <Shot media={site.media[room.media.key]} focus={room.media.focus} className="full shot" />
            <div className="shade" />
            {i === 0 && (
              // Always revealed: the script only fades the whole title out as the tour starts.
              <div className={`cap on ${styles.title}`}>
                <div className="chap">{chapter}</div>
                <Lines lines={title} as="h2" className="big serif sub" />
              </div>
            )}
            <Caption caption={room} as="h3" sub className={styles.room} />
          </div>
        ))}
        <div className="dip" />
      </div>
      <InsideMotion />
    </div>
  );
}
