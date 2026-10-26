"use client";
import { useCallback } from "react";
import type { EventTypeRow } from "@/modules/catalogue/client";
import type { MediaView } from "@/modules/media/client";
import { t } from "@/ui/i18n";
import { MediaField, parseForm, TextField, type Upload } from "../fields";
import { RowPanel, type FormApi, type PanelProps } from "../RowPanel";

type Form = { name: string; description: string; mediaKey: string | null; sort: string };

/** An event type: name, description, order, and its background photo (the platform owner's). */
export function EventPanel({ row, sort, media, upload, ...p }: PanelProps & { row?: EventTypeRow; sort: number; media: MediaView[]; upload?: Upload }) {
  const initial: Form = { name: row?.name ?? "", description: row?.description ?? "", mediaKey: row?.mediaKey ?? null, sort: String(row?.sort ?? sort) };
  return (
    <RowPanel
      {...p}
      kind="event"
      id={row?.id ?? null}
      initial={initial}
      toValue={(f) => parseForm(f, [], ["sort"])}
      removeText={t("editor.removeEventConfirm", { name: row?.name ?? "" })}
    >
      {(api) => <EventFields api={api} media={media} upload={upload} />}
    </RowPanel>
  );
}

function EventFields({ api: { form, set, errors, reason }, media, upload }: { api: FormApi<Form>; media: MediaView[]; upload?: Upload }) {
  const background = form.mediaKey ? [form.mediaKey] : [];
  const setBackground = useCallback(
    (update: (keys: string[]) => string[]) => set("mediaKey", update(form.mediaKey ? [form.mediaKey] : [])[0] ?? null),
    [set, form.mediaKey],
  );
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
      <MediaField
        label={t("field.background")}
        keys={background}
        max={1}
        media={media}
        upload={upload}
        onChange={setBackground}
        error={errors.mediaKey}
        reason={reason("mediaKey")}
      />
      <TextField label={t("field.sort")} inputMode="numeric" value={form.sort} onChange={(v) => set("sort", v)} error={errors.sort} reason={reason("sort")} />
    </>
  );
}
