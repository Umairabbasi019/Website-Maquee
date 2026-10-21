"use client";
import { useState, type KeyboardEvent } from "react";
import type { PublicCatalogue } from "@/modules/catalogue";
import { t } from "@/ui/i18n";
import { useEnquiry } from "../shared/enquiry-state";
import { formatRs, lakhFrom } from "../shared/format";
import styles from "./packages.module.css";

type Props = { events: PublicCatalogue["events"]; selected: string; canChoose: boolean };

export const packageTabId = (slug: string) => `packages-tab-${slug}`;
const panelId = (slug: string) => `packages-panel-${slug}`;

const STEP: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/** WAI-ARIA tabs with automatic activation: arrows wrap, Home/End jump, only the selected tab is in the tab order. */
export function PackageTabs({ events, selected: initial, canChoose }: Props) {
  const [selected, setSelected] = useState(initial);
  const { choosePackage } = useEnquiry();

  const onKeyDown = (e: KeyboardEvent) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = events[step(events.findIndex((ev) => ev.slug === selected), events.length)].slug;
    setSelected(next);
    document.getElementById(packageTabId(next))?.focus();
  };

  return (
    <>
      <div className={`fade ${styles.tabs}`} role="tablist" aria-label={t("packages.tabs")} onKeyDown={onKeyDown}>
        {events.map((ev) => (
          <button
            key={ev.slug}
            type="button"
            role="tab"
            id={packageTabId(ev.slug)}
            aria-selected={ev.slug === selected}
            aria-controls={panelId(ev.slug)}
            tabIndex={ev.slug === selected ? 0 : -1}
            className={styles.tab}
            onClick={() => setSelected(ev.slug)}
          >
            {ev.name}
          </button>
        ))}
      </div>
      {events.map((ev) => (
        <div
          key={ev.slug}
          id={panelId(ev.slug)}
          hidden={ev.slug !== selected}
          role="tabpanel"
          aria-labelledby={packageTabId(ev.slug)}
          className={`fade ${styles.pkgs}`}
        >
          {ev.packages.map((p) => (
            <div key={p.name} className={p.featured ? `${styles.pkg} ${styles.feat}` : styles.pkg}>
              <h3>{p.name}</h3>
              <div className={styles.price}>
                {formatRs(p.pricePerGuestPaisa)} <small>{t("packages.perGuestMin", { min: p.minGuests })}</small>
              </div>
              <div className={styles.total}>
                {t("packages.from", { lakh: lakhFrom(p.pricePerGuestPaisa, p.minGuests), guests: p.minGuests })}
              </div>
              <ul>
                {p.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              {canChoose && (
                <a
                  className={p.featured ? "pill" : "pill ghost"}
                  href="#contact"
                  onClick={() => choosePackage({ eventSlug: ev.slug, name: p.name, pricePerGuestPaisa: p.pricePerGuestPaisa, minGuests: p.minGuests })}
                >
                  {t("packages.choose", { name: p.name })}
                </a>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
