import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient, getViewer, needsMfa } from "@/modules/access";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";

export const metadata: Metadata = { title: t("admin.heading"), robots: { index: false, follow: false } };

// shortcut: placeholder until Task 10 builds the console; it only enforces MFA and admin-only access.
async function Admin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (await needsMfa(await createServerClient(), viewer.userId)) redirect("/mfa");
  if (!viewer.isPlatformAdmin) return <Forbidden />;
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("admin.heading")}</h1>
      <p className="mt-2">{t("admin.body")}</p>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Suspense fallback={<p>{t("loading")}</p>}>
        <Admin />
      </Suspense>
    </main>
  );
}
