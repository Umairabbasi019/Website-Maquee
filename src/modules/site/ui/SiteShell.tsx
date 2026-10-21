import { EnquiryProvider } from "@/sections/shared/enquiry-state";
import type { SiteView } from "@/sections/types";
import { t } from "@/ui/i18n";
import { fontClassName } from "../fonts";
import { SECTION_COMPONENTS } from "../sections";
import { themeStyle } from "../theme";
import { ShellChrome } from "./ShellChrome";
import styles from "./site.module.css";
import "./site-base.css";

// Marks the page as script-enabled before paint, so "hidden until revealed" styles apply only when JavaScript can reveal them.
const JS_FLAG = 'document.documentElement.classList.add("js")';

export function SiteShell({ site }: { site: SiteView }) {
  const { nav } = site.content;
  const logoUrls = site.theme.logo ? site.media[site.theme.logo]?.urls : undefined;
  const logo = logoUrls && (logoUrls.s ?? logoUrls.m ?? logoUrls.l);

  return (
    <div className={`site-root ${styles.site} ${fontClassName}`} style={themeStyle(site.theme)}>
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <ShellChrome
        brand={nav.brand}
        cta={site.sections.includes("contact") ? nav.cta : undefined}
        logo={logo ? { url: logo } : undefined}
        links={site.navLinks}
      />
      <main>
        <EnquiryProvider>
          {site.sections.map((key) => {
            const Section = SECTION_COMPONENTS[key];
            return Section && <Section key={key} site={site} />;
          })}
        </EnquiryProvider>
      </main>
      {site.status === "setup" && (
        <div className={styles.previewBar} role="status">
          {t("site.previewBar")}
        </div>
      )}
    </div>
  );
}
