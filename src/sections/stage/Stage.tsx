import type { CSSProperties } from "react";
import { t } from "@/ui/i18n";
import { Caption } from "../shared/Caption";
import { editAttrs } from "../shared/edit";
import { Shot } from "../shared/Shot";
import type { SectionProps } from "../types";
import styles from "./stage.module.css";
import { StageMotion } from "./StageMotion";

/** The stage opens as a soft circle over a blurred room, then the caption comes up over a scrim. */
export function Stage({ site }: SectionProps) {
  const { background, reveal, caption } = site.content.stage;
  return (
    <div id="stage" className="pin" style={{ "--pin": "280vh" } as CSSProperties} {...editAttrs(site, "section:stage", t("edit.section", { name: "stage" }))}>
      <div className="sticky">
        <div className="frame">
          <Shot media={site.media[background.key]} focus={background.focus} className={`full ${styles.bg}`} decorative />
          <Shot media={site.media[reveal.key]} focus={reveal.focus} className={`full ${styles.reveal}`} />
          <div className={`full ${styles.scrim}`} />
          <Caption caption={caption} as="h2" className={styles.cap} />
        </div>
        <div className="dip" />
      </div>
      <StageMotion />
    </div>
  );
}
