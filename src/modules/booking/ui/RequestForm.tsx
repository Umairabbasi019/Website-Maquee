"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { t, type TranslationKey } from "@/ui/i18n";
import type { RequestFormState, RequestFormValues } from "../client";
import styles from "./booking.module.css";
import { Estimate, type EstimateAction } from "./Estimate";
import { focusFirstInvalid } from "./labels";

type Option = { id: string; name: string };
type Props = {
  action: (state: RequestFormState, fd: FormData) => Promise<RequestFormState>;
  /** Set only when the venue shows the estimate. */
  estimate?: EstimateAction;
  events: (Option & { packages: Option[] })[];
  addons: (Option & { price: string })[];
  slots: Option[];
  maxGuests: number;
  today: string;
  lastDay: string;
  prefill: RequestFormValues;
};

const errorId = (field: string) => `booking-${field}-error`;
const PHONE_HINT = "booking-phone-hint";

/** A plain form posting to a Server Action, so it works without JavaScript; the action's answer re-renders it with the input kept. */
export function RequestForm({ action, estimate, events, addons, slots, maxGuests, today, lastDay, prefill }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? prefill;
  const form = useRef<HTMLFormElement>(null);
  // The answer re-mounts the form (see the key), which drops focus.
  useEffect(() => {
    if (state) focusFirstInvalid(form.current);
  }, [state]);
  const invalid = new Set(state?.errors);
  // aria-invalid and aria-describedby for a field, and its message.
  const field = (name: string) => (invalid.has(name) ? { "aria-invalid": true, "aria-describedby": errorId(name) } : {});
  const message = (name: string) =>
    invalid.has(name) && (
      <p id={errorId(name)} className={styles.error}>
        {t(`booking.error.${name}` as TranslationKey)}
      </p>
    );
  const chips = (name: "slotId" | "eventTypeId", legend: string, options: Option[]): ReactNode => (
    <fieldset role="radiogroup" className={styles.chips} {...field(name)}>
      <legend className={styles.lab}>{legend}</legend>
      {options.map((o) => (
        <label key={o.id}>
          <input type="radio" name={name} value={o.id} required defaultChecked={v[name] === o.id} />
          <span>{o.name}</span>
        </label>
      ))}
      {message(name)}
    </fieldset>
  );

  return (
    <>
      <h1 className={styles.title}>{t("booking.heading")}</h1>
      <p className={styles.lead}>{t("booking.lead")}</p>
      {/* The key re-mounts the fields after each answer, so their defaults show the posted values. */}
      <form ref={form} key={JSON.stringify(state)} action={formAction} className={styles.card}>
        {state && (
          <p role="alert" tabIndex={-1} className={styles.alert}>
            {t(state.message === "limited" ? "booking.limited" : state.errors.length ? "booking.error.fields" : "booking.error.invalid")}
          </p>
        )}
        <div className={styles.two}>
          <div>
            <label>
              <span className={styles.lab}>{t("booking.date")}</span>
              <input type="date" name="date" required min={today} max={lastDay} defaultValue={v.date} {...field("date")} />
            </label>
            {message("date")}
          </div>
          <div>
            <label>
              <span className={styles.lab}>{t("booking.guests")}</span>
              <input
                type="number"
                name="guests"
                required
                min={1}
                max={maxGuests}
                inputMode="numeric"
                defaultValue={v.guests}
                {...field("guests")}
              />
            </label>
            {message("guests")}
          </div>
        </div>
        {chips("eventTypeId", t("booking.event"), events)}
        {chips("slotId", t("booking.slot"), slots)}
        <label>
          <span className={styles.lab}>{t("booking.package")}</span>
          <select name="packageId" defaultValue={v.packageId}>
            <option value="">{t("booking.noPackage")}</option>
            {events
              .filter((e) => e.packages.length > 0)
              .map((e) => (
                <optgroup key={e.id} label={e.name}>
                  {e.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>
        {addons.length > 0 && (
          <fieldset className={styles.list}>
            <legend className={styles.lab}>{t("booking.addons")}</legend>
            {addons.map((a) => (
              <label key={a.id} className={styles.check}>
                <input type="checkbox" name="addonIds" value={a.id} defaultChecked={v.addonIds.includes(a.id)} />
                <span>
                  {a.name} <small>{a.price}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {estimate && <Estimate estimate={estimate} />}
        <div className={styles.two}>
          <div>
            <label>
              <span className={styles.lab}>{t("booking.name")}</span>
              <input type="text" name="name" required maxLength={80} autoComplete="name" defaultValue={v.name} {...field("name")} />
            </label>
            {message("name")}
          </div>
          <div>
            <label>
              <span className={styles.lab}>{t("booking.phone")}</span>
              <input
                type="tel"
                name="phone"
                required
                autoComplete="tel"
                defaultValue={v.phone}
                {...field("phone")}
                aria-describedby={invalid.has("phone") ? `${PHONE_HINT} ${errorId("phone")}` : PHONE_HINT}
              />
            </label>
            <small id={PHONE_HINT} className={styles.hint}>
              {t("booking.phoneHint")}
            </small>
            {message("phone")}
          </div>
        </div>
        <label className={styles.check}>
          <input type="checkbox" name="whatsappConsent" defaultChecked={v.whatsappConsent} />
          <span>{t("booking.whatsapp")}</span>
        </label>
        <div className={styles.trap} aria-hidden="true">
          <label>
            {t("booking.website")}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <div>
          <button type="submit" className="pill" disabled={pending}>
            {t("booking.submit")}
          </button>
        </div>
      </form>
    </>
  );
}
