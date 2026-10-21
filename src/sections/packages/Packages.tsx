import { Lines } from "../shared/lines";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import { PackageTabs } from "./PackageTabs";
import styles from "./packages.module.css";

/** One tab per event that has packages; every panel is server-rendered so prices are in the page without JavaScript. */
export function Packages({ site }: SectionProps) {
  const { chapter, lines, lead, fine, background, defaultEvent } = site.content.packages;
  const events = site.catalogue.events.filter((e) => e.packages.length > 0);
  if (!events.length) return null;
  const selected = events.some((e) => e.slug === defaultEvent) ? defaultEvent! : events[0].slug;
  const { offers } = site.catalogue;

  return (
    <section id="packages" className={styles.block}>
      <Shot media={site.media[background.key]} focus={background.focus} className={`full melt ${styles.bg}`} />
      <div className={styles.rel} data-r>
        <div className="chap fade">{chapter}</div>
        <Lines lines={lines} as="h2" className={`title serif ${styles.title}`} />
        <p className={`fade ${styles.lead}`}>{lead}</p>
        <PackageTabs events={events} selected={selected} canChoose={site.sections.includes("contact")} />
        <p className={`fade ${styles.fine}`}>{fine}</p>
        {offers.length > 0 && (
          <div className={styles.offers}>
            {offers.map((o, i) => (
              <div key={i} className={`fade ${styles.offer}`} style={{ transitionDelay: `${0.6 + i * 0.08}s` }}>
                <b>{o.title}</b>
                {o.body}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
