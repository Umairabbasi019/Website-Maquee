"use client";
import type { AddonRow } from "@/modules/catalogue/client";
import { rupeesInput } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { CheckField, parseForm, SelectField, TextField } from "../fields";
import { RowPanel, type PanelProps } from "../RowPanel";

/** An add-on: name, price in rupees, charged once or per guest, shown or hidden, order. */
export function AddonPanel({ row, sort, ...p }: PanelProps & { row?: AddonRow; sort: number }) {
  const basis: AddonRow["basis"] = row?.basis ?? "flat";
  const initial = {
    name: row?.name ?? "",
    pricePaisa: row ? rupeesInput(row.pricePaisa) : "",
    basis,
    active: row?.active ?? true,
    sort: String(row?.sort ?? sort),
  };
  return (
    <RowPanel
      {...p}
      kind="addon"
      id={row?.id ?? null}
      initial={initial}
      toValue={(f) => parseForm(f, ["pricePaisa"], ["sort"])}
      removeText={t("editor.removeConfirm", { name: row?.name ?? "" })}
    >
      {({ form, set, errors, reason }) => (
        <>
          <TextField label={t("field.name")} value={form.name} onChange={(v) => set("name", v)} error={errors.name} reason={reason("name")} />
          <TextField
            label={t("field.price")}
            inputMode="decimal"
            value={form.pricePaisa}
            onChange={(v) => set("pricePaisa", v)}
            error={errors.pricePaisa}
            reason={reason("pricePaisa")}
          />
          <SelectField<AddonRow["basis"]>
            label={t("field.basis")}
            value={form.basis}
            onChange={(v) => set("basis", v)}
            reason={reason("basis")}
            options={[
              { value: "flat", label: t("field.basis.flat") },
              { value: "per_guest", label: t("field.basis.per_guest") },
            ]}
          />
          <CheckField label={t("field.active")} checked={form.active} onChange={(v) => set("active", v)} reason={reason("active")} />
          <TextField label={t("field.sort")} inputMode="numeric" value={form.sort} onChange={(v) => set("sort", v)} error={errors.sort} reason={reason("sort")} />
        </>
      )}
    </RowPanel>
  );
}
