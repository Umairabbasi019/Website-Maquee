"use client";
import { useActionState, useId } from "react";
import { MoneyRulesSchema, type TenantSettings } from "@/modules/tenants/client";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { saveMoneyRulesAction } from "./actions";
import { FormStatus } from "./form-status";

const METHODS = MoneyRulesSchema.shape.paymentMethods.unwrap().element.options;

/** `full` = tenant.settings.edit; otherwise only the price estimate toggle is editable (prices.edit). */
export function MoneyRulesForm({ rules, full }: { rules: TenantSettings["moneyRules"]; full: boolean }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveMoneyRulesAction, null);
  const error = state && "error" in state;
  const field = { disabled: !full, "aria-invalid": error || undefined, "aria-describedby": error ? `${id}-error` : undefined, className: inputClass };

  return (
    <form action={action} aria-label={t("settings.moneyRules")} className="space-y-3 rounded-lg border border-muted/40 p-4">
      {!full && <p className="text-sm">{t("settings.money.estimateOnly")}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          {t("settings.money.tax")}
          <input name="taxPercent" type="number" min={0} max={100} step="any" required defaultValue={rules.taxPercent} {...field} />
        </label>
        <label className="block">
          {t("settings.money.advance")}
          <input name="advancePercent" type="number" min={0} max={100} step="any" required defaultValue={rules.advancePercent} {...field} />
        </label>
        <label className="block">
          {t("settings.money.hold")}
          <input name="holdHours" type="number" min={1} required defaultValue={rules.holdHours} {...field} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input name="instantBooking" type="checkbox" disabled={!full} defaultChecked={rules.instantBooking} />
        {t("settings.money.instant")}
      </label>
      <label className="flex items-center gap-2">
        <input name="showPriceEstimate" type="checkbox" defaultChecked={rules.showPriceEstimate} />
        {t("settings.money.estimate")}
      </label>
      <fieldset>
        <legend>{t("settings.money.methods")}</legend>
        {METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input name="paymentMethods" type="checkbox" value={m} disabled={!full} defaultChecked={rules.paymentMethods.includes(m)} />
            {t(`settings.money.method.${m}`)}
          </label>
        ))}
      </fieldset>
      <FormStatus id={`${id}-error`} state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {t("settings.save")}
      </button>
    </form>
  );
}
