import type { CSSProperties } from "react";
import { t } from "@/ui/i18n";
import { editAttrs } from "../shared/edit";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import { EventActions } from "./EventActions";
import styles from "./events.module.css";
import { EventsMotion } from "./EventsMotion";

/** Event names stack on the right; the background, text and buttons follow the active one as the pin scrolls. */
export function Events({ site }: SectionProps) {
  const { chapter, checkCta, packagesCta } = site.content.events;
  const { events } = site.catalogue;
  // In the editor an empty section still renders, so its "Add an event" placeholder has somewhere to be.
  if (!events.length && !site.editing) return null;
  const canCheck = site.sections.includes("contact");
  const canSee = site.sections.includes("packages");

  return (
    // Mockup: 400vh for five events.
    <div id="events" className="pin" style={{ "--pin": `${100 + events.length * 60}vh` } as CSSProperties} {...editAttrs(site, "section:events", t("edit.section", { name: "events" }))}>
      <div className="sticky">
        {events.map((ev) => (
          <div className="frame" key={ev.slug} {...editAttrs(site, `event:${ev.id}`, t("edit.event", { name: ev.name }))}>
            {ev.mediaKey && <Shot media={site.media[ev.mediaKey]} className={`full melt ${styles.bg}`} decorative />}
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
        {site.editing && <div {...editAttrs(site, "event-new", t("edit.eventNew"))} />}
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
