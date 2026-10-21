"use client";
import { useActionState } from "react";
import type { SecretKind } from "@/modules/tenants";
import { t } from "@/ui/i18n";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { saveSecret, setLoginLimits, type FormResult } from "./actions";

function Result({ state }: { state: FormResult }) {
  if (!state) return null;
  if ("error" in state) {
    return (
      <p role="alert" className="rounded-md border border-text px-3 py-2">
        {t(state.error)}
      </p>
    );
  }
  return <p role="status">{t(state.ok)}</p>;
}

export function LimitsForm({
  tenantId,
  loginLimit,
  managerLimit,
}: {
  tenantId: string;
  loginLimit: number;
  managerLimit: number;
}) {
  const [state, action, pending] = useActionState(
    (_prev: FormResult, form: FormData) =>
      setLoginLimits(tenantId, Number(form.get("loginLimit")), Number(form.get("managerLimit"))),
    null,
  );
  return (
    <form action={action} className="mt-4 max-w-md space-y-4">
      <Result state={state} />
      <label className="block">
        {t("admin.loginLimit")}
        <input
          name="loginLimit"
          type="number"
          min={1}
          max={50}
          step={1}
          required
          defaultValue={loginLimit}
          className={inputClass}
        />
      </label>
      <label className="block">
        {t("admin.managerLimit")}
        <input
          name="managerLimit"
          type="number"
          min={1}
          max={50}
          step={1}
          required
          defaultValue={managerLimit}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {t("admin.saveLimits")}
      </button>
    </form>
  );
}

export function SecretForm({
  tenantId,
  kind,
  savedOn,
}: {
  tenantId: string;
  kind: SecretKind;
  savedOn: string | null;
}) {
  const [state, action, pending] = useActionState(
    (_prev: FormResult, form: FormData) => saveSecret(tenantId, kind, String(form.get("value") ?? "")),
    null,
  );
  const label = t(`secret.${kind}`);
  return (
    <form action={action} className="space-y-2 rounded-lg border border-muted/40 p-4">
      <label className="block">
        {label}
        <input name="value" type="password" autoComplete="off" required maxLength={4000} className={inputClass} />
      </label>
      <p data-testid={`secret-${kind}`} className="text-sm">
        {savedOn ? `${t("admin.secretSavedOn")} ${savedOn}` : t("admin.secretNotSet")}
      </p>
      <Result state={state} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${t("admin.saveSecret")}: ${label}`}
        className={buttonClass}
      >
        {t("admin.saveSecret")}
      </button>
    </form>
  );
}
