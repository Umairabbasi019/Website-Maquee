"use client";
import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { PublicCatalogue } from "@/modules/catalogue";
import { t } from "@/ui/i18n";
import { useEnquiry } from "../shared/enquiry-state";
import styles from "./packages.module.css";

// `edit` holds the editor's data-edit attributes (empty on the public site); `newEdit` is set only while editing.
type Pkg = PublicCatalogue["events"][number]["packages"][number] & { priceText: string; lakh: string; edit: Record<string, string> };
type Props = {
  events: (Omit<PublicCatalogue["events"][number], "packages"> & { packages: Pkg[]; newEdit?: Record<string, string> })[];
  selected: string;
  canChoose: boolean;
};
const noSubscription = () => () => {};

export const packageTabId = (slug: string) => `packages-tab-${slug}`;
const panelId = (slug: string) => `packages-panel-${slug}`;

const STEP: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/** Without JavaScript every panel shows under its event name and the tablist is hidden; html.js (set by the shell) turns on the tabs. WAI-ARIA tabs with automatic activation: arrows wrap, Home/End jump, only the selected tab is in the tab order. */
export function PackageTabs({ events, selected: initial, canChoose }: Props) {
  const [selected, setSelected] = useState(initial);
  const { choosePackage } = useEnquiry();
  // False in server HTML, true once hydrated: without JavaScript there are no tabs, so panels are plain groups then.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = STEP[e.key];
    if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
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
          role={hydrated ? "tabpanel" : undefined}
          aria-labelledby={hydrated ? packageTabId(ev.slug) : undefined}
          className={`fade ${styles.pkgs} ${ev.slug === selected ? "" : styles.off}`}
        >
          <h3 className={styles.event}>{ev.name}</h3>
          {ev.packages.map((p) => (
            <div key={p.id} className={p.featured ? `${styles.pkg} ${styles.feat}` : styles.pkg} {...p.edit}>
              <h4>{p.name}</h4>
              <div className={styles.price}>
                {p.priceText} <small>{t("packages.perGuestMin", { min: p.minGuests })}</small>
              </div>
              <div className={styles.total}>
                {t("packages.from", { lakh: p.lakh, guests: p.minGuests })}
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
          {ev.newEdit && <div {...ev.newEdit} />}
        </div>
      ))}
    </>
  );
}
