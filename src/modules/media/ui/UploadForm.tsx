"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import type { MediaCategory } from "../server/library";

export type UploadState = { key: string } | { error: TranslationKey } | null;
export type UploadAction = (prev: UploadState, formData: FormData) => Promise<UploadState>;

const CATEGORY_LABELS: Record<MediaCategory, TranslationKey> = {
  gallery: "media.category.gallery",
  stage: "media.category.stage",
  event: "media.category.event",
  room: "media.category.room",
  hero: "media.category.hero",
  logo: "media.category.logo",
  seo: "media.category.seo",
};

/** File, alt text and category. The server checks the file's content; `accept` only narrows the file chooser. */
export function UploadForm({
  action,
  categories,
  onUploaded,
}: {
  action: UploadAction;
  categories: readonly MediaCategory[];
  onUploaded?: (key: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  const error = state && "error" in state ? state.error : null;
  const key = state && "key" in state ? state.key : null;
  // Once per uploaded key, even when the parent passes a new onUploaded on every render.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!key || handled.current === key) return;
    handled.current = key;
    onUploaded?.(key);
  }, [key, onUploaded]);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <label className="block">
        {t("media.file")}
        <input
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          className={inputClass}
        />
        <span id={`${id}-hint`} className="mt-1 block text-sm">
          {t("media.fileHint")}
        </span>
      </label>
      <label className="block">
        {t("media.alt")}
        <input name="alt" required maxLength={250} className={inputClass} />
      </label>
      <label className="block">
        {t("media.category")}
        <select name="category" className={inputClass}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_LABELS[c])}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="rounded-md border border-text px-3 py-2">
          {t(error)}
        </p>
      )}
      {key && <p role="status">{t("media.uploaded")}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("media.uploading") : t("media.upload")}
      </button>
    </form>
  );
}
