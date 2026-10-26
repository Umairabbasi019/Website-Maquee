import { t } from "@/ui/i18n";
import { editAttrs } from "../shared/edit";
import { formatRs, lakhFrom } from "../shared/format";
import { Lines } from "../shared/lines";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import { PackageTabs } from "./PackageTabs";
import styles from "./packages.module.css";

/** One tab per event that has packages; every panel is server-rendered so prices are in the page without JavaScript. */
export function Packages({ site }: SectionProps) {
  const { chapter, lines, lead, fine, background, defaultEvent } = site.content.packages;
  // Prices are formatted here, on the server: the first Intl call in the browser costs hundreds of ms and must not land in hydration.
  const events = site.catalogue.events
    .filter((e) => e.packages.length > 0)
    .map((e) => ({
      ...e,
      newEdit: site.editing ? editAttrs(site, `package-new:${e.id}`, t("edit.packageNew", { event: e.name })) : undefined,
      packages: e.packages.map((p) => ({
        ...p,
        priceText: formatRs(p.pricePerGuestPaisa),
        lakh: lakhFrom(p.pricePerGuestPaisa, p.minGuests),
        edit: editAttrs(site, `package:${p.id}`, t("edit.package", { name: p.name })),
      })),
    }));
  if (!events.length) return null;
  const selected = events.some((e) => e.slug === defaultEvent) ? defaultEvent! : events[0].slug;
  const { offers, addons, stageThemes } = site.catalogue;

  return (
    <section id="packages" className={styles.block} {...editAttrs(site, "section:packages", t("edit.section", { name: "packages" }))}>
      {/* shortcut: default sizes assume a viewport-tall box, but this section can be taller; fine while the photo is blurred, size by section height if it ever is not. */}
      <Shot media={site.media[background.key]} focus={background.focus} className={`full melt ${styles.bg}`} decorative />
      <div className={styles.rel} data-r>
        <div className="chap fade">{chapter}</div>
        <Lines lines={lines} as="h2" className={`title serif ${styles.title}`} />
        <p className={`fade ${styles.lead}`}>{lead}</p>
        <PackageTabs events={events} selected={selected} canChoose={site.sections.includes("contact")} />
        <p className={`fade ${styles.fine}`}>{fine}</p>
        {(addons.length > 0 || stageThemes.length > 0 || site.editing) && (
          <>
            <h3 className={`fade ${styles.extras}`}>{t("packages.extras")}</h3>
            <div className={styles.offers}>
              {addons.map((a) => (
                <div key={a.id} className={`fade ${styles.offer}`} {...editAttrs(site, `addon:${a.id}`, t("edit.addon", { name: a.name }))}>
                  <b>{a.name}</b>
                  {a.basis === "per_guest" ? t("packages.addonPerGuest", { price: formatRs(a.pricePaisa) }) : formatRs(a.pricePaisa)}
                </div>
              ))}
              {site.editing && <div {...editAttrs(site, "addon-new", t("edit.addonNew"))} />}
              {stageThemes.map((s) => (
                <div key={s.id} className={`fade ${styles.offer}`} {...editAttrs(site, `stage-theme:${s.id}`, t("edit.stageTheme", { name: s.name }))}>
                  <b>{s.name}</b>
                  {s.description} {t("packages.themeFrom", { price: formatRs(s.pricePaisa) })}
                </div>
              ))}
              {site.editing && <div {...editAttrs(site, "stage-theme-new", t("edit.stageThemeNew"))} />}
            </div>
          </>
        )}
        {(offers.length > 0 || site.editing) && (
          <div className={styles.offers}>
            {offers.map((o, i) => (
              <div
                key={o.id}
                className={`fade ${styles.offer}`}
                style={{ transitionDelay: `${0.6 + i * 0.08}s` }}
                {...editAttrs(site, `offer:${o.id}`, t("edit.offer", { title: o.title }))}
              >
                <b>{o.title}</b>
                {o.body}
              </div>
            ))}
            {site.editing && <div {...editAttrs(site, "offer-new", t("edit.offerNew"))} />}
          </div>
        )}
      </div>
    </section>
  );
}
