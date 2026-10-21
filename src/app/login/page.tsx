import type { Metadata } from "next";
import { t } from "@/ui/i18n";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("login.heading"), robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">{t("login.heading")}</h1>
      <LoginForm />
    </main>
  );
}
