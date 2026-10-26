"use client";
import type { PackageRow } from "@/modules/catalogue/client";
import { rupeesInput } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { CheckField, ListField, parseForm, TextField } from "../fields";
import { RowPanel, type PanelProps } from "../RowPanel";

/** A package: name, price per guest in rupees, minimum guests, menu items, featured and order. */
export function PackagePanel({ row, eventId, sort, ...p }: PanelProps & { row?: PackageRow; eventId: string; sort: number }) {
  const initial = {
    eventTypeId: row?.eventTypeId ?? eventId,
    name: row?.name ?? "",
    pricePerGuestPaisa: row ? rupeesInput(row.pricePerGuestPaisa) : "",
    minGuests: String(row?.minGuests ?? 100),
    items: row?.items ?? [""],
    featured: row?.featured ?? false,
    sort: String(row?.sort ?? sort),
  };
  return (
    <RowPanel
      {...p}
      kind="package"
      id={row?.id ?? null}
      initial={initial}
      toValue={(f) => parseForm(f, ["pricePerGuestPaisa"], ["minGuests", "sort"])}
      removeText={t("editor.removeConfirm", { name: row?.name ?? "" })}
    >
      {({ form, set, errors, reason }) => (
        <>
          <TextField label={t("field.name")} value={form.name} onChange={(v) => set("name", v)} error={errors.name} reason={reason("name")} />
          <TextField
            label={t("field.pricePerGuest")}
            inputMode="decimal"
            value={form.pricePerGuestPaisa}
            onChange={(v) => set("pricePerGuestPaisa", v)}
            error={errors.pricePerGuestPaisa}
            reason={reason("pricePerGuestPaisa")}
          />
          <TextField
            label={t("field.minGuests")}
            inputMode="numeric"
            value={form.minGuests}
            onChange={(v) => set("minGuests", v)}
            error={errors.minGuests}
            reason={reason("minGuests")}
          />
          <ListField
            label={t("field.items")}
            itemLabel={t("field.item")}
            addLabel={t("field.items.add")}
            items={form.items}
            onChange={(v) => set("items", v)}
            errors={errors}
            path="items"
            reason={reason("items")}
          />
          <CheckField label={t("field.featured")} checked={form.featured} onChange={(v) => set("featured", v)} reason={reason("featured")} />
          <TextField label={t("field.sort")} inputMode="numeric" value={form.sort} onChange={(v) => set("sort", v)} error={errors.sort} reason={reason("sort")} />
        </>
      )}
    </RowPanel>
  );
}
