"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { formatRs } from "@/sections/shared/format";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import type { Quote } from "../pricing";
import type { ConfirmResult, QuotePreview, StatusResult } from "../server/staff";
import { focusFirstInvalid } from "./labels";

type ConfirmError = Extract<ConfirmResult, { error: string }>["error"];
type ConfirmValues = { hallId: string; finalTotalRupees: string; reason: string };
/** The confirm action's answer when it did not confirm: the error, the posted values and the posted hall's preview. */
export type ConfirmFormState = { error: ConfirmError; values: ConfirmValues; preview: QuotePreview | null } | null;
export type ReasonFormState = { error: Extract<StatusResult, { error: string }>["error"]; reason: string } | null;

const CONFIRM_ERRORS: Record<ConfirmError, TranslationKey> = {
  invalid: "bookings.error.invalid",
  forbidden: "editor.forbidden",
  notFound: "bookings.error.notFound",
  slotTaken: "bookings.error.slotTaken",
  capacity: "bookings.error.capacity",
  state: "bookings.error.state",
  outOfRange: "bookings.error.outOfRange",
  priceChanged: "bookings.error.priceChanged",
};
const REASON_ERRORS: Record<Extract<StatusResult, { error: string }>["error"], TranslationKey> = {
  invalid: "bookings.error.reason",
  forbidden: "editor.forbidden",
  notFound: "bookings.error.notFound",
  state: "bookings.error.changed",
};
// The field each error is about; the others point at the alert alone.
const HALL_ERRORS = new Set<ConfirmError>(["slotTaken", "capacity", "notFound"]);

const marked = (on: boolean, id: string) => (on ? { "aria-invalid": true, "aria-describedby": id } : {});

function Alert({ id, message }: { id: string; message: TranslationKey }) {
  return (
    <p id={id} role="alert" tabIndex={-1} className="rounded-md border border-text px-3 py-2">
      {t(message)}
    </p>
  );
}

/** A quote's lines, then its total and advance as given (stored totals are never re-summed from the lines). */
export function QuoteLines({ quote }: { quote: Quote }) {
  return (
    <ul className="space-y-1">
      {quote.lines.map((l, i) => (
        <li key={i} className="flex justify-between gap-4">
          <span>{l.label}</span>
          <span>{formatRs(l.amountPaisa)}</span>
        </li>
      ))}
      <li className="flex justify-between gap-4 border-t border-muted/40 pt-1 font-medium">
        <span>{t("booking.view.total")}</span>
        <span>{formatRs(quote.totalPaisa)}</span>
      </li>
      <li className="flex justify-between gap-4">
        <span>{t("booking.view.advance")}</span>
        <span>{formatRs(quote.advancePaisa)}</span>
      </li>
    </ul>
  );
}

function Preview({ quote }: { quote: QuotePreview | null }) {
  const missing = quote?.missing.length ? t("bookings.confirm.missing", { items: quote.missing.join(", ") }) : null;
  return (
    <div className="space-y-2 rounded-lg border border-muted/40 p-4">
      {/* The calculated total shown; confirm refuses if it has changed by then. */}
      <input type="hidden" name="previewedTotalPaisa" value={quote?.totalPaisa ?? ""} />
      <h3 className="font-medium">{t("bookings.confirm.preview")}</h3>
      {/* A hall change announces the new total (and any gap), not every line. */}
      <p role="status" className="sr-only">
        {quote && [`${t("booking.view.total")} ${formatRs(quote.totalPaisa)}`, missing].filter(Boolean).join(". ")}
      </p>
      {quote && (
        <>
          <QuoteLines quote={quote} />
          {missing && <p className="rounded-md border border-text px-3 py-2">{missing}</p>}
        </>
      )}
    </div>
  );
}

type ConfirmProps = {
  bookingId: string;
  halls: { id: string; label: string; disabled: boolean }[];
  /** The first hall that fits, and its preview; "" and null when none fits. */
  hallId: string;
  preview: QuotePreview | null;
  canOverride: boolean;
  action: (state: ConfirmFormState, fd: FormData) => Promise<ConfirmFormState>;
  previewAction: (bookingId: string, hallId: string) => Promise<QuotePreview | null>;
};

/**
 * Hall, calculated quote and an optional final total. A plain form posting to a Server Action: without JavaScript,
 * "Update quote" reloads the page for the chosen hall; with it, the quote follows the hall select. The final total starts
 * empty and is sent only when typed, so a catalogue change between preview and confirm never needs quotes.override.
 */
export function ConfirmForm({ bookingId, halls, hallId, preview, canOverride, action, previewAction }: ConfirmProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const [live, setLive] = useState<QuotePreview | null | undefined>(undefined);
  const asked = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state) focusFirstInvalid(form.current);
  }, [state]);
  const v = state?.values ?? { hallId, finalTotalRupees: "", reason: "" };
  const error = state?.error;
  const errorId = `confirm-${bookingId}-error`;

  const onHall = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const n = ++asked.current;
    // A failed preview shows no quote rather than the previous hall's.
    const quote = await previewAction(bookingId, e.target.value).catch(() => null);
    if (n === asked.current) setLive(quote);
  };

  return (
    // The key re-mounts the fields after each answer, so their defaults show the posted values.
    <form ref={form} key={JSON.stringify(state)} action={formAction} aria-label={t("bookings.confirm.heading")} className="space-y-4">
      <input type="hidden" name="id" value={bookingId} />
      {/* Without the override fields, invalid can only be the hall (or a tampered id). */}
      {error && <Alert id={errorId} message={error === "invalid" && !canOverride ? "bookings.error.hall" : CONFIRM_ERRORS[error]} />}
      {!hallId && <p>{t("bookings.confirm.noHall")}</p>}
      <label className="block">
        {t("bookings.confirm.hall")}
        <select name="hallId" required defaultValue={v.hallId} onChange={onHall} className={inputClass} {...marked(!!error && (HALL_ERRORS.has(error) || (error === "invalid" && !canOverride)), errorId)}>
          {halls.map((h) => (
            <option key={h.id} value={h.id} disabled={h.disabled}>
              {h.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" name="intent" value="preview" formNoValidate className={buttonClass}>
          {t("bookings.confirm.update")}
        </button>
      </noscript>
      <Preview quote={live !== undefined ? live : state ? state.preview : preview} />
      {canOverride && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block">
              {t("bookings.confirm.final")}
              <input
                name="finalTotalRupees"
                inputMode="decimal"
                defaultValue={v.finalTotalRupees}
                className={inputClass}
                {...marked(error === "invalid", errorId)}
                aria-describedby={error === "invalid" ? `confirm-${bookingId}-hint ${errorId}` : `confirm-${bookingId}-hint`}
              />
            </label>
            <small id={`confirm-${bookingId}-hint`}>{t("bookings.confirm.finalHint")}</small>
          </div>
          <label className="block">
            {t("bookings.confirm.reason")}
            <input name="reason" maxLength={300} defaultValue={v.reason} className={inputClass} {...marked(error === "invalid", errorId)} />
          </label>
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {t("bookings.confirm.submit")}
      </button>
    </form>
  );
}

type ReasonProps = {
  bookingId: string;
  kind: "decline" | "cancel";
  action: (state: ReasonFormState, fd: FormData) => Promise<ReasonFormState>;
};

/** Decline or cancel, with a staff-only reason. */
export function ReasonForm({ bookingId, kind, action }: ReasonProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state) focusFirstInvalid(form.current);
  }, [state]);
  const errorId = `${kind}-${bookingId}-error`;

  return (
    <form ref={form} key={JSON.stringify(state)} action={formAction} aria-label={t(`bookings.${kind}.heading`)} className="space-y-3">
      <input type="hidden" name="id" value={bookingId} />
      {state && <Alert id={errorId} message={REASON_ERRORS[state.error]} />}
      <label className="block">
        {t(`bookings.${kind}.reason`)}
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={300}
          rows={2}
          defaultValue={state?.reason}
          className={inputClass}
          {...marked(state?.error === "invalid", errorId)}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {t(`bookings.${kind}.submit`)}
      </button>
    </form>
  );
}
