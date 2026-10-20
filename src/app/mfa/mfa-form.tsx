"use client";
import { useActionState } from "react";
import { t } from "@/ui/i18n";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { startEnrol, verifyCode } from "./actions";

function CodeForm() {
  const [state, action, pending] = useActionState(verifyCode, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      {state?.failed && (
        <p role="alert" className="rounded-md border border-text px-3 py-2">
          {t("mfa.failed")}
        </p>
      )}
      <label className="block">
        {t("mfa.code")}
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {t("mfa.verify")}
      </button>
    </form>
  );
}

function Enrol() {
  const [state, action, pending] = useActionState(startEnrol, null);
  if (state && "qr" in state) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URI */}
        <img src={state.qr} alt={t("mfa.scan")} width={192} height={192} className="mt-6 bg-white p-2" />
        <p className="mt-4">{t("mfa.secret")}</p>
        <code className="mt-1 block break-all rounded-md bg-white px-3 py-2">{state.secret}</code>
        <CodeForm />
      </>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-4">
      <p>{t("mfa.enrolIntro")}</p>
      {state?.failed && (
        <p role="alert" className="rounded-md border border-text px-3 py-2">
          {t("mfa.enrolFailed")}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {t("mfa.start")}
      </button>
    </form>
  );
}

export function MfaForm({ enrolled }: { enrolled: boolean }) {
  if (!enrolled) return <Enrol />;
  return (
    <>
      <p className="mt-2">{t("mfa.challengeIntro")}</p>
      <CodeForm />
    </>
  );
}
