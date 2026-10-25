import { t } from "@/ui/i18n";
import { formatLocalPhone } from "../shared/format";
import { coverSizes } from "../shared/image";
import { Lines } from "../shared/lines";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import styles from "./contact.module.css";
import { EnquiryForm } from "./EnquiryForm";
import { LiveHours } from "./LiveHours";
import { MapEmbed } from "./MapEmbed";

/** Enquiry form beside a sticky photo, then the map card. Call, address and directions are plain links, so they work without JavaScript. */
export function Contact({ site }: SectionProps) {
  const c = site.content.contact;
  const { phone, whatsapp, hours, timeZone, address, map, instagram } = site.contact;
  const events = site.catalogue.events.map((e) => ({ slug: e.slug, name: e.name }));
  const defaultEvent = site.content.packages.defaultEvent;
  const directions = map
    ? `https://www.google.com/maps/dir/?api=1&destination=${map.lat},${map.lng}`
    : address && `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  const logoUrls = site.theme.logo ? site.media[site.theme.logo]?.urls : undefined;
  const logo = logoUrls && (logoUrls.s ?? logoUrls.m ?? logoUrls.l);
  const photo = site.media[c.media.key];
  // Matches contact.module.css: full width x 55vh up to 860px, else the 1.1fr of 1.1fr 1fr columns (52.4vw) x 100vh.
  const photoSizes = `(max-width: 860px) ${coverSizes(photo?.aspect, "100vw", 55)}, ${coverSizes(photo?.aspect, "53vw", 100)}`;

  return (
    <section id="contact">
      <div className={styles.hero}>
        <div className={styles.pic}>
          <Shot media={photo} focus={c.media.focus} sizes={photoSizes} className="full" />
        </div>
        <div className={styles.side} data-r>
          {hours.length > 0 && <LiveHours hours={hours} timeZone={timeZone} openText={c.openText} closedText={c.closedText} />}
          <Lines lines={c.lines} as="h2" className={`title serif ${styles.title}`} />
          <p className={`fade ${styles.lead}`}>{c.lead}</p>
          <EnquiryForm
            className={`fade ${styles.enq}`}
            events={events}
            defaultEvent={events.some((e) => e.slug === defaultEvent) ? defaultEvent! : events[0]?.slug ?? ""}
            otherEvent={c.otherEvent}
            slots={site.slots}
            guests={c.guests}
            greeting={c.greeting}
            timeZone={timeZone}
            whatsapp={whatsapp}
            sendCta={c.sendCta.replace("{name}", c.manager.name)}
            call={phone ? { href: `tel:${phone}`, label: c.callCta.replace("{phone}", formatLocalPhone(phone)) } : undefined}
            compare={site.sections.includes("packages") ? c.compareLink : undefined}
          />
          <div className={`fade ${styles.who}`}>
            <div className={styles.mono} aria-hidden>
              {c.manager.name.charAt(0)}
            </div>
            <div>
              <div className={`serif ${styles.whoName}`}>
                {c.manager.name}, {c.manager.role}
              </div>
              <div className={styles.whoNote}>{c.manager.replyNote}</div>
            </div>
          </div>
        </div>
      </div>
      <div className={map ? styles.map : styles.noMap}>
        {map && (
          <>
            <MapEmbed src={`https://maps.google.com/maps?q=${map.lat},${map.lng}&z=14&output=embed`} title={t("site.mapTitle", { name: site.name })} className={styles.frame} />
            {logo && (
              <div className={styles.pinmark}>
                {/* eslint-disable-next-line @next/next/no-img-element -- small decorative logo from venue storage */}
                <img src={logo} alt="" />
              </div>
            )}
          </>
        )}
        <div className={styles.card} data-r>
          <h3 className="fade">{c.map.title}</h3>
          <p className={`fade ${styles.place}`}>{c.map.place}</p>
          {c.map.facts.length > 0 && (
            <div className={`fade ${styles.facts}`}>
              {c.map.facts.map((f) => (
                <div key={f.label}>
                  <b>{f.label}</b>
                  {f.value}
                </div>
              ))}
            </div>
          )}
          {directions && (
            <div className={`fade ${styles.acts}`}>
              <a className="pill" href={directions} target="_blank" rel="noopener">
                {c.map.directionsCta}
              </a>
            </div>
          )}
          {instagram && (
            <div className={`fade ${styles.social}`}>
              <a href={instagram} target="_blank" rel="noopener noreferrer">
                {t("site.instagram")}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
