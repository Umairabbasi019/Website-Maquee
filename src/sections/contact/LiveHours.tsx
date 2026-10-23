"use client";
import { t } from "@/ui/i18n";
import { useAfterIdle } from "../shared/useAfterIdle";
import { openStatus, type OpeningHours } from "../shared/hours";
import styles from "./contact.module.css";

type Props = { hours: OpeningHours; timeZone: string; openText: string; closedText: string };

/** Open/closed in the venue's own time zone. Server HTML says "Checking hours…", since only the browser knows the visit time. */
export function LiveHours({ hours, timeZone, openText, closedText }: Props) {
  const status = useAfterIdle(() => openStatus(hours, timeZone, new Date()));
  const closed = status !== null && !status.open;
  return (
    <div className={`fade ${styles.hours} ${closed ? styles.closed : ""}`}>
      <i />
      <span>{status === null ? t("site.checkingHours") : closed ? closedText.replace("{time}", status.opensAt ?? "") : openText}</span>
    </div>
  );
}
