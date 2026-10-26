"use client";
import { useActionState, useId } from "react";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { removePhoto, replacePhoto, saveAlt, type ItemState } from "./actions";

export type GridItem = { key: string; alt: string; thumb?: string; usedIn: string[] };

function Message({ id, state }: { id: string; state: ItemState }) {
  if (!state) return null;
  if ("ok" in state) return <p role="status">{t(state.ok)}</p>;
  return (
    <p id={id} role="alert" className="rounded-md border border-text px-3 py-2">
      {t(state.error)}
      {state.usedIn && ` ${t("media.usedIn", { places: state.usedIn.join(", ") })}`}
    </p>
  );
}

function Card({ item }: { item: GridItem }) {
  const id = useId();
  const [altState, altAction, altPending] = useActionState(saveAlt, null);
  const [replaceState, replaceAction, replacePending] = useActionState(replacePhoto, null);
  const [deleteState, deleteAction, deletePending] = useActionState(removePhoto, null);
  const altError = altState && "error" in altState;
  const replaceError = replaceState && "error" in replaceState;
  const inUse = item.usedIn.length > 0;

  return (
    <li data-key={item.key} aria-labelledby={`${id}-alt`} className="space-y-3 rounded-lg border border-muted/40 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- venue photo from storage, remote host not configured for next/image */}
      {item.thumb && <img src={item.thumb} alt="" loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />}
      <p id={`${id}-alt`} className="font-medium">
        {item.alt}
      </p>
      <p id={`${id}-used`} className="text-sm">
        {inUse ? t("media.usedIn", { places: item.usedIn.join(", ") }) : t("media.unused")}
      </p>

      <form action={altAction} className="space-y-2">
        <input type="hidden" name="key" value={item.key} />
        <label className="block text-sm">
          {t("media.alt")}
          <input
            name="alt"
            required
            maxLength={250}
            defaultValue={item.alt}
            aria-invalid={altError || undefined}
            aria-describedby={altError ? `${id}-alt-error` : undefined}
            className={inputClass}
          />
        </label>
        <Message id={`${id}-alt-error`} state={altState} />
        <button type="submit" disabled={altPending} className={buttonClass}>
          {t("media.saveAlt")}
        </button>
      </form>

      <form action={replaceAction} className="space-y-2">
        <input type="hidden" name="key" value={item.key} />
        <label className="block text-sm">
          {t("media.replaceFile")}
          <input
            name="file"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={replaceError || undefined}
            aria-describedby={replaceError ? `${id}-replace-error` : undefined}
            className={inputClass}
          />
        </label>
        <Message id={`${id}-replace-error`} state={replaceState} />
        <button type="submit" disabled={replacePending} className={buttonClass}>
          {t("media.replace")}
        </button>
      </form>

      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!window.confirm(t("media.deleteConfirm"))) e.preventDefault();
        }}
      >
        <input type="hidden" name="key" value={item.key} />
        <Message id={`${id}-delete-error`} state={deleteState} />
        {/* Disabled while in use; the "Used in" line above says why. */}
        <button type="submit" disabled={inUse || deletePending} aria-describedby={`${id}-used`} className={buttonClass}>
          {t("media.delete")}
        </button>
      </form>
    </li>
  );
}

export function MediaGrid({ items }: { items: GridItem[] }) {
  if (!items.length) return <p className="mt-4">{t("media.empty")}</p>;
  return (
    <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.key} item={item} />
      ))}
    </ul>
  );
}
