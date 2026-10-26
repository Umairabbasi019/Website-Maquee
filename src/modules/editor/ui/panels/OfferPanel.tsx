"use client";
import type { OfferRow } from "@/modules/catalogue/client";
import { rupeesInput } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { CheckField, parseForm, SelectField, TextField } from "../fields";
import { RowPanel, type PanelProps } from "../RowPanel";

type Discount = "none" | "percent" | "fixed";

/** An offer: title, text, shown or hidden, order, and an optional discount (percent, or fixed rupees) with dates. */
export function OfferPanel({ row, sort, ...p }: PanelProps & { row?: OfferRow; sort: number }) {
  const discount: Discount = row?.discountKind ?? "none";
  const amount = row?.discountValue;
  const initial = {
    title: row?.title ?? "",
    body: row?.body ?? "",
    active: row?.active ?? true,
    sort: String(row?.sort ?? sort),
    discount,
    discountValue: amount == null ? "" : discount === "fixed" ? rupeesInput(amount) : String(amount),
    startsOn: row?.startsOn ?? "",
    endsOn: row?.endsOn ?? "",
  };
  return (
    <RowPanel
      {...p}
      kind="offer"
      id={row?.id ?? null}
      initial={initial}
      toValue={({ discount: d, ...f }) =>
        parseForm(
          {
            ...f,
            discountKind: d === "none" ? null : d,
            discountValue: d === "none" ? null : f.discountValue,
            startsOn: f.startsOn || null,
            endsOn: f.endsOn || null,
          },
          d === "fixed" ? ["discountValue"] : [],
          d === "percent" ? ["discountValue", "sort"] : ["sort"],
        )
      }
      removeText={t("editor.removeConfirm", { name: row?.title ?? "" })}
    >
      {({ form, set, errors, reason }) => (
        <>
          <TextField label={t("field.title")} value={form.title} onChange={(v) => set("title", v)} error={errors.title} reason={reason("title")} />
          <TextField label={t("field.body")} multiline value={form.body} onChange={(v) => set("body", v)} error={errors.body} reason={reason("body")} />
          <CheckField label={t("field.active")} checked={form.active} onChange={(v) => set("active", v)} reason={reason("active")} />
          <SelectField<Discount>
            label={t("field.discountKind")}
            value={form.discount}
            onChange={(v) => set("discount", v)}
            reason={reason("discountKind")}
            options={[
              { value: "none", label: t("field.discount.none") },
              { value: "percent", label: t("field.discount.percent") },
              { value: "fixed", label: t("field.discount.fixed") },
            ]}
          />
          {form.discount !== "none" && (
            <TextField
              label={t(form.discount === "percent" ? "field.discountPercent" : "field.discountRupees")}
              inputMode={form.discount === "percent" ? "numeric" : "decimal"}
              value={form.discountValue}
              onChange={(v) => set("discountValue", v)}
              error={errors.discountValue}
              reason={reason("discountValue")}
            />
          )}
          <TextField label={t("field.startsOn")} type="date" value={form.startsOn} onChange={(v) => set("startsOn", v)} error={errors.startsOn} reason={reason("startsOn")} />
          <TextField label={t("field.endsOn")} type="date" value={form.endsOn} onChange={(v) => set("endsOn", v)} error={errors.endsOn} reason={reason("endsOn")} />
          <TextField label={t("field.sort")} inputMode="numeric" value={form.sort} onChange={(v) => set("sort", v)} error={errors.sort} reason={reason("sort")} />
        </>
      )}
    </RowPanel>
  );
}
