"use client";
import { useId, useState } from "react";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import type { MediaCategory } from "../server/library";
import type { MediaView } from "../server/assets";
import { UploadForm, type UploadAction } from "./UploadForm";

/**
 * Lets the viewer choose one of the venue's photos (search by alt text) and hands its key to `onPick`.
 * `upload` is given only when the viewer holds media.manage; a new upload is picked straight away.
 */
export function MediaPicker({
  assets,
  onPick,
  upload,
}: {
  assets: MediaView[];
  onPick: (key: string) => void;
  upload?: { action: UploadAction; categories: readonly MediaCategory[] };
}) {
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const id = useId();
  const q = query.trim().toLowerCase();
  const shown = q ? assets.filter((a) => a.alt.toLowerCase().includes(q)) : assets;

  return (
    <div className="space-y-4">
      <label className="block">
        {t("media.search")}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} />
      </label>
      {shown.length === 0 ? (
        <p role="status">{t("media.noMatch")}</p>
      ) : (
        <ul aria-label={t("media.pickList")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shown.map((a) => (
            <li key={a.key} data-key={a.key}>
              <button
                type="button"
                onClick={() => onPick(a.key)}
                className="block w-full rounded-md border border-muted/40 p-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- venue photo from storage, remote host not configured for next/image */}
                <img src={a.urls.s ?? a.urls.m ?? a.urls.l} alt="" loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
                <span className="mt-1 block">{a.alt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {upload &&
        (uploading ? (
          <section aria-labelledby={`${id}-upload`}>
            <h3 id={`${id}-upload`} className="font-medium">
              {t("media.uploadNew")}
            </h3>
            <UploadForm action={upload.action} categories={upload.categories} onUploaded={onPick} />
          </section>
        ) : (
          <button type="button" onClick={() => setUploading(true)} className={buttonClass}>
            {t("media.uploadNew")}
          </button>
        ))}
    </div>
  );
}
