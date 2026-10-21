import type { CSSProperties } from "react";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import { EventActions } from "./EventActions";
import styles from "./events.module.css";
import { EventsMotion } from "./EventsMotion";

/** Event names stack on the right; the background, text and buttons follow the active one as the pin scrolls. */
export function Events({ site }: SectionProps) {
  const { chapter, checkCta, packagesCta } = site.content.events;
  const { events } = site.catalogue;
  if (!events.length) return null;
  const canCheck = site.sections.includes("contact");
  const canSee = site.sections.includes("packages");

  return (
    // Mockup: 400vh for five events.
    <div id="events" className="pin" style={{ "--pin": `${100 + events.length * 60}vh` } as CSSProperties}>
      <div className="sticky">
        {events.map((ev) => (
          <div className="frame" key={ev.slug}>
            {ev.mediaKey && <Shot media={site.media[ev.mediaKey]} className={`full melt ${styles.bg}`} />}
            <div className={styles.shade} />
            <div className={`cap ${styles.note}`}>
              <div className="chap fade">{chapter}</div>
              <p className="fade" style={{ margin: 0 }}>
                {ev.description}
              </p>
              <EventActions
                slug={ev.slug}
                check={canCheck ? checkCta.replace("{event}", ev.name) : undefined}
                packages={canSee && ev.packages.length > 0 ? packagesCta : undefined}
                className={`fade ${styles.acts}`}
              />
            </div>
          </div>
        ))}
        <ul className={styles.list}>
          {events.map((ev) => (
            <li key={ev.slug}>{ev.name}</li>
          ))}
        </ul>
      </div>
      <EventsMotion />
    </div>
  );
}
