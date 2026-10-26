import { t } from "@/ui/i18n";
import type { SectionProps } from "../types";
import styles from "./footer.module.css";

export function Footer({ site }: SectionProps) {
  const { footer } = site.content;
  return (
    <footer id="footer" className={styles.footer}>
      <div className={styles.row}>
        <span>{footer.line}</span>
        <nav aria-label={t("site.navFooter")}>
          {site.navLinks.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          {site.contact.instagram && (
            <a href={site.contact.instagram} target="_blank" rel="noopener">
              {t("site.instagram")}
            </a>
          )}
        </nav>
        <span>{footer.copyright}</span>
      </div>
      <div className={styles.mark} aria-hidden="true">
        {footer.mark}
      </div>
    </footer>
  );
}
