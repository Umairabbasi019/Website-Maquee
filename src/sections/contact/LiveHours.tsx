"use client";
import { useSyncExternalStore } from "react";
import { t } from "@/ui/i18n";
import { openStatus, type OpeningHours } from "../shared/hours";
import styles from "./contact.module.css";

type Props = { hours: OpeningHours; timeZone: string; openText: string; closedText: string };

const noSubscribe = () => () => {};
// Snapshot is a string so React can compare it: OPEN, or the time the venue next opens.
const OPEN = "open";

/** Open/closed in the venue's own time zone. Server HTML says "Checking hours…", since only the browser knows the visit time. */
export function LiveHours({ hours, timeZone, openText, closedText }: Props) {
  const status = useSyncExternalStore(
    noSubscribe,
    () => {
      const s = openStatus(hours, timeZone, new Date());
      return s.open ? OPEN : (s.opensAt ?? "");
    },
    () => null,
  );
  const closed = status !== null && status !== OPEN;
  return (
    <div className={`fade ${styles.hours} ${closed ? styles.closed : ""}`}>
      <i />
      <span>{status === null ? t("site.checkingHours") : closed ? closedText.replace("{time}", status) : openText}</span>
    </div>
  );
}
