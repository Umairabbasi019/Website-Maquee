"use client";
import { useState } from "react";
import { t } from "@/ui/i18n";
import { buildEnquiryMessage, waLink } from "../shared/enquiry";
import { useEnquiry } from "../shared/enquiry-state";
import { addDays, todayIn } from "../shared/hours";
import { useAfterIdle } from "../shared/useAfterIdle";
import styles from "./contact.module.css";

type Props = {
  className: string;
  events: { slug: string; name: string }[];
  defaultEvent: string;
  otherEvent: string;
  slots: string[];
  guests: { min: number; max: number; step: number };
  greeting: string;
  timeZone: string;
  whatsapp?: string;
  sendCta: string;
  call?: { href: string; label: string };
  compare?: string;
};

// Value of the "Other" event chip; catalogue slugs are never empty.
const OTHER = "";

/** The visitor picks date, event, time and guests; the message preview and the WhatsApp link follow every change. */
export function EnquiryForm({ className, events, defaultEvent, otherEvent, slots, guests: range, greeting, timeZone, whatsapp, sendCta, call, compare }: Props) {
  const { eventSlug, pick, guests, chooseEvent, setGuests } = useEnquiry();
  // Server HTML has no min or default date (the server clock and zone would not match hydration); the browser fills them in once idle, after hydration.
  const today = useAfterIdle(() => todayIn(timeZone, new Date())) ?? "";
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState(slots.at(-1) ?? "");
  const [name, setName] = useState("");

  const dateValue = date ?? (today && addDays(today, 60));
  const ev = eventSlug ?? defaultEvent;
  const message = buildEnquiryMessage({
    greeting,
    date: dateValue || null,
    event: events.find((e) => e.slug === ev)?.name ?? otherEvent,
    slot,
    guests,
    pkg: pick?.eventSlug === ev ? pick : undefined,
    name: name.trim() || undefined,
  });

  return (
    <form className={className}>
      <div className={styles.two}>
        <label>
          <span className={styles.lab}>{t("contact.date")}</span>
          <input type="date" required min={today || undefined} value={dateValue} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className={styles.lab}>{t("contact.name")}</span>
          <input type="text" placeholder={t("contact.namePlaceholder")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <fieldset className={styles.chips}>
        <legend className={styles.lab}>{t("contact.event")}</legend>
        {[...events, { slug: OTHER, name: otherEvent }].map((e) => (
          <label key={e.slug}>
            <input type="radio" name="event" value={e.slug} checked={ev === e.slug} onChange={() => chooseEvent(e.slug)} />
            <span>{e.name}</span>
          </label>
        ))}
      </fieldset>
      {slots.length > 0 && (
        <fieldset className={styles.chips}>
          <legend className={styles.lab}>{t("contact.time")}</legend>
          {slots.map((s) => (
            <label key={s}>
              <input type="radio" name="slot" value={s} checked={slot === s} onChange={() => setSlot(s)} />
              <span>{s}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <span className={styles.lab}>{t("contact.guests")}</span>
        <div className={styles.guests}>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={guests}
            aria-label={t("contact.guestsLabel")}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
          <output>{guests}</output>
        </div>
      </div>
      <div className={styles.preview} aria-live="polite">
        <small>{t("contact.preview")}</small>
        {message}
      </div>
      {(whatsapp || call) && (
        <div className={styles.acts}>
          {whatsapp && (
            <a className={`pill ${styles.wa}`} href={waLink(whatsapp, message)} target="_blank" rel="noopener">
              {sendCta}
            </a>
          )}
          {call && (
            <a className="pill ghost" href={call.href}>
              {call.label}
            </a>
          )}
        </div>
      )}
      {compare && (
        <a className={styles.compare} href="#packages">
          {compare}
        </a>
      )}
    </form>
  );
}
