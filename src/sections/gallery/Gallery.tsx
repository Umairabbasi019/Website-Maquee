import type { CSSProperties } from "react";
import { t } from "@/ui/i18n";
import { Lines } from "../shared/lines";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import { GalleryMotion } from "./GalleryMotion";
import styles from "./gallery.module.css";

/** Rating, title and follow link over two film rows that drift in opposite directions. */
export function Gallery({ site }: SectionProps) {
  const { chapter, lines, followLabel, tiles, rating } = site.content.gallery;
  const shown = tiles.filter((tile) => site.media[tile.key]);
  // Each row holds its tiles twice so the drift never shows an empty end; only the first copy is read out.
  const strip = (list: typeof shown, copy: number) =>
    list.map((tile, i) => (
      <Shot key={`${copy}-${i}`} media={site.media[tile.key]} style={{ aspectRatio: tile.ratio }} aria-hidden={copy > 0 || undefined} />
    ));

  return (
    <section id="gallery" className={styles.gal}>
      <div className={styles.proof} data-r>
        {rating && (
          <a className={`fade ${styles.rating}`} href={rating.url} target="_blank" rel="noopener">
            <span className={`serif ${styles.score}`}>{rating.value.toFixed(1)}</span>
            <span>
              <b role="img" aria-label={t("gallery.stars", { value: rating.value })} style={{ "--stars": `${rating.value * 20}%` } as CSSProperties}>
                ★★★★★
              </b>
              <br />
              {t("gallery.reviews", { count: rating.count.toLocaleString("en-PK"), source: rating.source })}
            </span>
          </a>
        )}
        <div>
          <div className="chap fade">{chapter}</div>
          <Lines lines={lines} as="h2" className="title serif" />
        </div>
        {site.contact.instagram && followLabel && (
          <a className={`pill ghost fade ${styles.follow}`} href={site.contact.instagram} target="_blank" rel="noopener">
            {followLabel}
          </a>
        )}
      </div>
      {shown.length > 0 && (
        <div className={styles.reel}>
          <div className={`${styles.row} ${styles.r1}`}>
            {strip(shown, 0)}
            {strip(shown, 1)}
          </div>
          <div className={`${styles.row} ${styles.r2}`} aria-hidden="true">
            {strip(shown.toReversed(), 2)}
            {strip(shown.toReversed(), 3)}
          </div>
        </div>
      )}
      <GalleryMotion />
    </section>
  );
}
