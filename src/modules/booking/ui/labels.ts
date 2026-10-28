import { t, type TranslationKey } from "@/ui/i18n";

/** The venue's calendar date as written, not shifted by any time zone. */
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PK", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** A staff list status (a stored status, or "expired") as words. */
export const statusLabel = (status: string) => t(`bookings.status.${status}` as TranslationKey);

/**
 * After an answer re-mounts a form, focus moves to the first marked field (a marked radio group: its first radio),
 * else to the form's alert.
 */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  const marked = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  const target = marked?.matches('[role="radiogroup"]') ? marked.querySelector("input") : marked;
  (target ?? form?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
}
