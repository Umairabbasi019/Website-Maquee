"use client";
import { useCallback, useId, useState, type ReactNode } from "react";
import type { z } from "zod";
import { MediaPicker, type MediaCategory, type MediaView, type UploadAction } from "@/modules/media/client";
import { parseRupees } from "@/sections/shared/format";
import { inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";

/** Field path ("items.2") → message. */
export type Errors = Record<string, string>;

const smallButton =
  "rounded border border-muted/60 px-2 py-1 text-sm hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-40";

/** Label, control, the one-line reason a field is read-only, and its error; `describedBy` links the last two. */
function Field({ label, reason, error, children }: { label: string; reason?: string; error?: string; children: (ids: { id: string; describedBy?: string }) => ReactNode }) {
  const id = useId();
  const describedBy = [reason && `${id}-why`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {reason && (
        <p id={`${id}-why`} className="text-sm text-muted">
          {reason}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

type TextProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  /** Set when the viewer may not change this field: it is then read-only and says why. */
  reason?: string;
  multiline?: boolean;
  type?: "text" | "date";
  inputMode?: "decimal" | "numeric";
};

export function TextField({ label, value, onChange, error, reason, multiline, type = "text", inputMode }: TextProps) {
  return (
    <Field label={label} reason={reason} error={error}>
      {({ id, describedBy }) => {
        const common = {
          id,
          value,
          readOnly: Boolean(reason),
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
          className: `${inputClass} read-only:bg-muted/10`,
        };
        return multiline ? (
          <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
        );
      }}
    </Field>
  );
}

export function CheckField({ label, checked, onChange, reason }: { label: string; checked: boolean; onChange: (v: boolean) => void; reason?: string }) {
  const id = useId();
  return (
    <div>
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={checked}
          disabled={Boolean(reason)}
          aria-describedby={reason ? `${id}-why` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4"
        />
        {label}
      </label>
      {reason && (
        <p id={`${id}-why`} className="text-sm text-muted">
          {reason}
        </p>
      )}
    </div>
  );
}

export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  reason,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  reason?: string;
}) {
  return (
    <Field label={label} reason={reason}>
      {({ id, describedBy }) => (
        <select id={id} value={value} disabled={Boolean(reason)} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value as V)} className={inputClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

/** Up, down and remove buttons for item `i` of `count`, labelled with that item's own label. */
function ItemButtons({ label, i, count, onMove, onRemove, disabled }: { label: string; i: number; count: number; onMove: (to: number) => void; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" className={smallButton} disabled={disabled || i === 0} aria-label={t("list.up", { label })} onClick={() => onMove(i - 1)}>
        ↑
      </button>
      <button type="button" className={smallButton} disabled={disabled || i === count - 1} aria-label={t("list.down", { label })} onClick={() => onMove(i + 1)}>
        ↓
      </button>
      <button type="button" className={smallButton} disabled={disabled} aria-label={t("list.remove", { label })} onClick={onRemove}>
        ✕
      </button>
    </span>
  );
}

/** A list of short texts: each item its own labelled input ("Menu item 2"), with add, remove and move up/down. */
export function ListField({
  label,
  itemLabel: itemName,
  addLabel,
  items,
  onChange,
  errors,
  path,
  reason,
}: {
  label: string;
  /** One item's name; item n is labelled "<itemLabel> n". */
  itemLabel: string;
  addLabel: string;
  items: string[];
  onChange: (items: string[]) => void;
  errors: Errors;
  path: string;
  reason?: string;
}) {
  const id = useId();
  const [focusLast, setFocusLast] = useState(false);
  return (
    <fieldset className="space-y-2" aria-describedby={reason ? `${id}-why` : undefined}>
      <legend className="font-medium">{label}</legend>
      {reason && (
        <p id={`${id}-why`} className="text-sm text-muted">
          {reason}
        </p>
      )}
      <ol className="space-y-2">
        {items.map((item, i) => {
          const itemLabel = `${itemName} ${i + 1}`;
          const error = errors[`${path}.${i}`];
          return (
            <li key={i}>
              <div className="flex items-center gap-2">
                <input
                  aria-label={itemLabel}
                  value={item}
                  readOnly={Boolean(reason)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-${i}-err` : undefined}
                  ref={(el) => {
                    if (el && focusLast && i === items.length - 1) {
                      el.focus();
                      setFocusLast(false);
                    }
                  }}
                  onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                  className={`${inputClass} mt-0 read-only:bg-muted/10`}
                />
                <ItemButtons
                  label={itemLabel}
                  i={i}
                  count={items.length}
                  disabled={Boolean(reason)}
                  onMove={(to) => onChange(move(items, i, to))}
                  onRemove={() => onChange(items.filter((_, j) => j !== i))}
                />
              </div>
              {error && (
                <p id={`${id}-${i}-err`} className="text-sm font-medium text-red-800">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {errors[path] && <p className="text-sm font-medium text-red-800">{errors[path]}</p>}
      {!reason && (
        <button
          type="button"
          className={smallButton}
          onClick={() => {
            onChange([...items, ""]);
            setFocusLast(true);
          }}
        >
          {addLabel}
        </button>
      )}
    </fieldset>
  );
}

export type Upload = { action: UploadAction; categories: readonly MediaCategory[] };

/** Chosen venue photos in order (up to `max`), picked from the library with MediaPicker. */
export function MediaField({
  label,
  keys,
  max,
  media,
  upload,
  onChange,
  error,
  reason,
}: {
  label: string;
  keys: string[];
  max: number;
  media: MediaView[];
  upload?: Upload;
  onChange: (update: (keys: string[]) => string[]) => void;
  error?: string;
  reason?: string;
}) {
  const id = useId();
  const [picking, setPicking] = useState(false);
  const byKey = new Map(media.map((m) => [m.key, m]));
  // Stable, so MediaPicker's upload callback sees the same function across renders.
  const onPick = useCallback(
    (key: string) => {
      onChange((current) => (current.includes(key) ? current : [...current, key].slice(-max)));
      setPicking(false);
    },
    [onChange, max],
  );
  return (
    <fieldset className="space-y-2" aria-describedby={reason ? `${id}-why` : undefined}>
      <legend className="font-medium">{label}</legend>
      {reason && (
        <p id={`${id}-why`} className="text-sm text-muted">
          {reason}
        </p>
      )}
      <ol className="space-y-2">
        {keys.map((key, i) => {
          const photo = byKey.get(key);
          const itemLabel = t("field.photo", { n: i + 1 });
          return (
            <li key={key} className="flex items-center gap-2">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- venue photo from storage, remote host not configured for next/image
                <img src={photo.urls.s ?? photo.urls.m ?? photo.urls.l} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{photo?.alt || key}</span>
              <ItemButtons
                label={itemLabel}
                i={i}
                count={keys.length}
                disabled={Boolean(reason)}
                onMove={(to) => onChange((current) => move(current, i, to))}
                onRemove={() => onChange((current) => current.filter((k) => k !== key))}
              />
            </li>
          );
        })}
      </ol>
      {error && <p className="text-sm font-medium text-red-800">{error}</p>}
      {!reason &&
        (picking ? (
          <MediaPicker assets={media} onPick={onPick} upload={upload} />
        ) : (
          <button type="button" className={smallButton} onClick={() => setPicking(true)}>
            {t("field.addPhoto")}
          </button>
        ))}
    </fieldset>
  );
}

/** A whole number typed in a field, or null. */
const parseInt32 = (s: string) => (/^\s*-?\d{1,10}\s*$/.test(s) ? Number(s) : null);

/**
 * The form's string fields named in `rupees` (to paisa) and `ints` turned into numbers; a field that does not parse
 * gets an error instead. Null fields are left alone (an optional value that is unset).
 */
export function parseForm(form: Record<string, unknown>, rupees: readonly string[], ints: readonly string[]): { value: Record<string, unknown>; errors: Errors } {
  const value = { ...form };
  const errors: Errors = {};
  for (const [fields, parse, message] of [
    [rupees, parseRupees, t("editor.error.rupees")],
    [ints, parseInt32, t("editor.error.number")],
  ] as const) {
    for (const f of fields) {
      if (value[f] === null) continue;
      const n = parse(String(value[f]));
      if (n === null) errors[f] = message;
      else value[f] = n;
    }
  }
  return { value, errors };
}

/** Zod issues as one message per field path, in the editor's own words where Zod's would be cryptic. */
export function issueErrors(issues: z.core.$ZodIssue[]): Errors {
  const errors: Errors = {};
  for (const iss of issues) {
    const path = iss.path.join(".");
    errors[path] ??= issueMessage(iss);
  }
  return errors;
}

function issueMessage(iss: z.core.$ZodIssue): string {
  if (iss.code === "too_small") {
    const min = Number(iss.minimum);
    if (iss.origin === "string") return t(min <= 1 ? "editor.error.required" : "editor.error.min", { min });
    if (iss.origin === "array") return t("editor.error.minItems", { min });
    return t("editor.error.min", { min });
  }
  if (iss.code === "too_big") {
    const max = Number(iss.maximum);
    if (iss.origin === "string") return t("editor.error.tooLong", { max });
    if (iss.origin === "array") return t("editor.error.maxItems", { max });
    return t("editor.error.max", { max });
  }
  if (iss.code === "invalid_type") return t("editor.error.required");
  return iss.message;
}
