"use client";
import { useActionState, useId } from "react";
import type { Hall } from "@/modules/tenants";
import { rupeesInput } from "@/sections/shared/format";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { saveHallAction } from "./actions";
import { FormStatus } from "./form-status";

/** One hall. `full` = tenant.settings.edit; otherwise only the hire price is editable (prices.edit). */
function HallForm({ hall, full }: { hall?: Hall; full: boolean }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveHallAction, null);
  const error = state && "error" in state;
  const described = error ? `${id}-error` : undefined;
  const field = { disabled: !full, "aria-invalid": error || undefined, "aria-describedby": described, className: inputClass };

  return (
    <form action={action} aria-label={hall?.name ?? t("settings.halls.new")} className="space-y-3 rounded-lg border border-muted/40 p-4">
      {hall && <input type="hidden" name="id" value={hall.id} />}
      {!full && <p className="text-sm">{t("settings.hall.priceOnly")}</p>}
      <label className="block">
        {t("settings.hall.name")}
        <input name="name" required maxLength={60} defaultValue={hall?.name} {...field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          {t("settings.hall.capacityMin")}
          <input name="capacityMin" type="number" min={0} required defaultValue={hall?.capacityMin} {...field} />
        </label>
        <label className="block">
          {t("settings.hall.capacityMax")}
          <input name="capacityMax" type="number" min={0} required defaultValue={hall?.capacityMax} {...field} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input name="isActive" type="checkbox" disabled={!full} defaultChecked={hall?.isActive ?? true} />
        {t("settings.hall.active")}
      </label>
      <label className="block">
        {t("settings.hall.hirePrice")}
        <input
          name="hirePrice"
          inputMode="decimal"
          defaultValue={hall?.hirePricePaisa ? rupeesInput(hall.hirePricePaisa) : ""}
          aria-invalid={error || undefined}
          aria-describedby={described}
          className={inputClass}
        />
      </label>
      <FormStatus id={`${id}-error`} state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {hall ? t("settings.save") : t("settings.add")}
      </button>
    </form>
  );
}

export function HallsForm({ halls, full }: { halls: Hall[]; full: boolean }) {
  return (
    <div className="space-y-4">
      {halls.map((h) => (
        <HallForm key={h.id} hall={h} full={full} />
      ))}
      {full && <HallForm full />}
    </div>
  );
}
