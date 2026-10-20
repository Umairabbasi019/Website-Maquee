import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient, isPlatformAdminUser } from "@/modules/access";
import { t } from "@/ui/i18n";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: t("mfa.heading"), robots: { index: false, follow: false } };

async function Mfa() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(`mfa page: ${error.message}`);
  if (aal.currentLevel === "aal2") redirect((await isPlatformAdminUser(data.user.id)) ? "/admin" : "/dashboard");
  return <MfaForm enrolled={aal.nextLevel === "aal2"} />;
}

export default function MfaPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">{t("mfa.heading")}</h1>
      <Suspense fallback={<p className="mt-6">{t("loading")}</p>}>
        <Mfa />
      </Suspense>
    </main>
  );
}
