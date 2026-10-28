"use client";
import { useEffect, useRef, useState } from "react";
import { t } from "@/ui/i18n";
import { readRequestForm } from "../client";
import styles from "./booking.module.css";

/** The price choices only; the server prices them. Gives the formatted total, or null when the choices do not price. */
export type EstimateAction = (choices: { date: string; eventTypeId: string; guests: string; packageId: string; addonIds: string[] }) => Promise<string | null>;

// Typing guests fires a change per key; ask the server once the visitor pauses.
const WAIT_MS = 300;
// Name and phone do not change the price.
const PRICED = new Set(["date", "eventTypeId", "guests", "packageId", "addonIds"]);

/** Live estimate beside the form's choices. JavaScript only: hidden until the first answer, and the number never animates. */
export function Estimate({ estimate }: { estimate: EstimateAction }) {
  const box = useRef<HTMLDivElement>(null);
  // undefined: nothing yet; null: the choices do not price (an empty or out-of-range field).
  const [total, setTotal] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest = 0;
    const update = (e?: Event) => {
      if (e && !PRICED.has((e.target as HTMLInputElement).name)) return;
      clearTimeout(timer);
      const asked = ++latest;
      const { date, eventTypeId, guests, packageId, addonIds } = readRequestForm(new FormData(form));
      if (!packageId) return setTotal(t("booking.priceOnCall"));
      timer = setTimeout(async () => {
        const answer = await estimate({ date, eventTypeId, guests, packageId, addonIds });
        if (asked === latest) setTotal(answer);
      }, WAIT_MS);
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [estimate]);

  return (
    <div ref={box} role="status" className={styles.estimate} hidden={total === undefined}>
      <span className={styles.lab}>{t("booking.estimate")}</span>
      <strong>{total ?? "–"}</strong>
      <small>{t("booking.estimateNote")}</small>
    </div>
  );
}
