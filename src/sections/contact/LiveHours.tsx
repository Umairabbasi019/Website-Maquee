"use client";
import { t } from "@/ui/i18n";
import { useAfterIdle } from "../shared/useAfterIdle";
import { openStatus, type OpeningHours } from "../shared/hours";
import styles from "./contact.module.css";

type Props = { hours: OpeningHours; timeZone: string; openText: string; closedText: string; edit: Record<string, string> };

/** Open/closed in the venue's own time zone. Server HTML says "Checking hours…", since only the browser knows the visit time. */
export function LiveHours({ hours, timeZone, openText, closedText, edit }: Props) {
  // shortcut: worked out once per page view, so a tab left open past opening or closing shows stale text; add a timer to the next change if that matters.
  const status = useAfterIdle(() => openStatus(hours, timeZone, new Date()));
  const closed = status !== null && !status.open;
  return (
    <div className={`fade ${styles.hours} ${closed ? styles.closed : ""}`} {...edit}>
      <i />
      <span>{status === null ? t("site.checkingHours") : closed ? closedText.replace("{time}", status.opensAt ?? "") : openText}</span>
    </div>
  );
}
