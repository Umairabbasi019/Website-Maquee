"use client";
import { useActionState, useId } from "react";
import type { DatePrice } from "@/modules/calendar";
import { rupeesInput } from "@/sections/shared/format";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { deleteDatePriceAction, saveDatePriceAction } from "./actions";
import { confirmDelete, FormStatus } from "./form-status";

type EventOption = { id: string; name: string };

// Per guest is stored as paisa; the input shows rupees with a minus for a discount.
const valueInput = (p: DatePrice) =>
  p.kind === "percent" ? String(p.value) : `${p.value < 0 ? "-" : ""}${rupeesInput(Math.abs(p.value))}`;

function DatePriceForm({ price, events }: { price?: DatePrice; events: EventOption[] }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveDatePriceAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDatePriceAction, null);
  const error = state && "error" in state;
  const field = { "aria-invalid": error || undefined, "aria-describedby": error ? `${id}-error` : undefined, className: inputClass };

  return (
    <div className="space-y-3 rounded-lg border border-muted/40 p-4">
      <form action={action} aria-label={price?.label ?? t("settings.datePrices.new")} className="space-y-3">
        {price && <input type="hidden" name="id" value={price.id} />}
        <label className="block">
          {t("settings.datePrice.label")}
          <input name="label" required maxLength={60} defaultValue={price?.label} {...field} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            {t("settings.datePrice.startsOn")}
            <input name="startsOn" type="date" required defaultValue={price?.startsOn} {...field} />
          </label>
          <label className="block">
            {t("settings.datePrice.endsOn")}
            <input name="endsOn" type="date" required defaultValue={price?.endsOn} {...field} />
          </label>
        </div>
        <label className="block">
          {t("settings.datePrice.eventType")}
          <select name="eventTypeId" defaultValue={price?.eventTypeId ?? ""} {...field}>
            <option value="">{t("settings.datePrice.allEvents")}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            {t("settings.datePrice.kind")}
            <select name="kind" defaultValue={price?.kind ?? "percent"} {...field}>
              <option value="percent">{t("settings.datePrice.percent")}</option>
              <option value="per_guest">{t("settings.datePrice.perGuest")}</option>
            </select>
          </label>
          <label className="block">
            {t("settings.datePrice.value")}
            <input name="value" required inputMode="decimal" defaultValue={price && valueInput(price)} {...field} />
          </label>
        </div>
        <FormStatus id={`${id}-error`} state={state} />
        <button type="submit" disabled={pending} className={buttonClass}>
          {price ? t("settings.save") : t("settings.add")}
        </button>
      </form>
      {price && (
        <form action={deleteAction} onSubmit={confirmDelete}>
          <input type="hidden" name="id" value={price.id} />
          <FormStatus id={`${id}-delete-error`} state={deleteState} />
          <button type="submit" disabled={deletePending} className={buttonClass}>
            {t("settings.delete")}
          </button>
        </form>
      )}
    </div>
  );
}

export function DatePricesForm({ prices, events }: { prices: DatePrice[]; events: EventOption[] }) {
  return (
    <div className="space-y-4">
      {!prices.length && <p>{t("settings.datePrices.none")}</p>}
      {prices.map((p) => (
        <DatePriceForm key={p.id} price={p} events={events} />
      ))}
      <DatePriceForm events={events} />
    </div>
  );
}
