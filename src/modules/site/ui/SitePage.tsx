import type { ReactNode } from "react";
import type { SiteView } from "@/sections/types";
import { t } from "@/ui/i18n";
import { fontClassName } from "../fonts";
import { themeStyle } from "../theme";
import styles from "./site.module.css";
import "./site-base.css";

/** A plain page in the venue's look (theme, fonts, brand link home), for routes beside the one-page site such as /book. No motion. */
export function SitePage({ site, children }: { site: SiteView; children: ReactNode }) {
  return (
    <div className={`site-root ${styles.site} ${fontClassName}`} style={themeStyle(site.theme)}>
      <header className={styles.pageHead}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, so the site shell's inline html.js script runs */}
        <a href="/" className={styles.brand}>
          <span>{site.content.nav.brand}</span>
        </a>
      </header>
      <main className={styles.pageMain}>{children}</main>
      {site.status === "setup" && (
        <div className={styles.previewBar} role="status">
          {t("site.previewBar")}
        </div>
      )}
    </div>
  );
}
