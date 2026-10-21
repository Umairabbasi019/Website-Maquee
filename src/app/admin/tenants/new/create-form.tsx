"use client";
import { useActionState } from "react";
import { t } from "@/ui/i18n";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { createTenant } from "./actions";

type Option = { id: string; name: string };

export function CreateTenantForm({ templates, accounts }: { templates: Option[]; accounts: Option[] }) {
  const [state, action, pending] = useActionState(createTenant, null);
  return (
    <form action={action} className="mt-6 max-w-md space-y-4">
      {state?.error && (
        <p role="alert" className="rounded-md border border-text px-3 py-2">
          {t(state.error)}
        </p>
      )}
      <label className="block">
        {t("admin.create.name")}
        <input name="name" required maxLength={120} defaultValue={state?.name} className={inputClass} />
      </label>
      <label className="block">
        {t("admin.create.slug")}
        <input
          name="slug"
          required
          maxLength={63}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby="slug-hint"
          defaultValue={state?.slug}
          className={inputClass}
        />
        <span id="slug-hint" className="mt-1 block text-sm">
          {t("admin.create.slugHint")}
        </span>
      </label>
      <label className="block">
        {t("admin.create.account")}
        <select name="accountId" className={inputClass}>
          <option value="new">{t("admin.create.newAccount")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t("admin.create.template")}
        <select name="templateId" className={inputClass}>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {t("admin.create.submit")}
      </button>
    </form>
  );
}
