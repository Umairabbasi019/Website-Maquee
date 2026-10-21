"use client";
import { useActionState } from "react";
import { t } from "@/ui/i18n";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      {state?.failed && (
        <p role="alert" className="rounded-md border border-text px-3 py-2">
          {t("login.failed")}
        </p>
      )}
      <label className="block">
        {t("login.email")}
        <input name="email" type="email" autoComplete="username" required defaultValue={state?.email} className={inputClass} />
      </label>
      <label className="block">
        {t("login.password")}
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {t("login.submit")}
      </button>
    </form>
  );
}
