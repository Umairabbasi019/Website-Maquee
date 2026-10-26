"use client";
import { useCallback } from "react";
import type { StageThemeRow } from "@/modules/catalogue/client";
import type { MediaView } from "@/modules/media/client";
import { rupeesInput } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { CheckField, MediaField, parseForm, TextField, type Upload } from "../fields";
import { RowPanel, type FormApi, type PanelProps } from "../RowPanel";

// StageThemeRowSchema's limit on photos per theme.
const MAX_PHOTOS = 8;

type Form = { name: string; description: string; pricePaisa: string; mediaKeys: string[]; active: boolean; sort: string };

/** A stage (decor) theme: name, description, price in rupees, photos, shown or hidden, order. */
export function StageThemePanel({ row, sort, media, upload, ...p }: PanelProps & { row?: StageThemeRow; sort: number; media: MediaView[]; upload?: Upload }) {
  const initial: Form = {
    name: row?.name ?? "",
    description: row?.description ?? "",
    pricePaisa: row ? rupeesInput(row.pricePaisa) : "",
    mediaKeys: row?.mediaKeys ?? [],
    active: row?.active ?? true,
    sort: String(row?.sort ?? sort),
  };
  return (
    <RowPanel
      {...p}
      kind="stageTheme"
      id={row?.id ?? null}
      initial={initial}
      toValue={(f) => parseForm(f, ["pricePaisa"], ["sort"])}
      removeText={t("editor.removeConfirm", { name: row?.name ?? "" })}
    >
      {(api) => <ThemeFields api={api} media={media} upload={upload} />}
    </RowPanel>
  );
}

function ThemeFields({ api: { form, set, errors, reason }, media, upload }: { api: FormApi<Form>; media: MediaView[]; upload?: Upload }) {
  const setPhotos = useCallback((update: (keys: string[]) => string[]) => set("mediaKeys", update(form.mediaKeys)), [set, form.mediaKeys]);
  return (
    <>
      <TextField label={t("field.name")} value={form.name} onChange={(v) => set("name", v)} error={errors.name} reason={reason("name")} />
      <TextField
        label={t("field.description")}
        multiline
        value={form.description}
        onChange={(v) => set("description", v)}
        error={errors.description}
        reason={reason("description")}
      />
      <TextField
        label={t("field.price")}
        inputMode="decimal"
        value={form.pricePaisa}
        onChange={(v) => set("pricePaisa", v)}
        error={errors.pricePaisa}
        reason={reason("pricePaisa")}
      />
      <MediaField
        label={t("field.photos")}
        keys={form.mediaKeys}
        max={MAX_PHOTOS}
        media={media}
        upload={upload}
        onChange={setPhotos}
        error={errors.mediaKeys}
        reason={reason("mediaKeys")}
      />
      <CheckField label={t("field.active")} checked={form.active} onChange={(v) => set("active", v)} reason={reason("active")} />
      <TextField label={t("field.sort")} inputMode="numeric" value={form.sort} onChange={(v) => set("sort", v)} error={errors.sort} reason={reason("sort")} />
    </>
  );
}
