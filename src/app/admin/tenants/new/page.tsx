import Link from "next/link";
import { listAccounts, listTemplates } from "@/modules/tenants";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { adminGate } from "../../guard";
import { CreateTenantForm } from "./create-form";

export const instant = false; // see ../../layout.tsx

export default async function NewTenantPage() {
  if (!(await adminGate())) return <Forbidden />;
  const [templates, accounts] = await Promise.all([listTemplates(), listAccounts()]);
  return (
    <>
      <Link href="/admin" className="underline">
        {t("admin.back")}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{t("admin.create.heading")}</h1>
      {templates.length === 0 ? (
        <p className="mt-6">{t("admin.create.noTemplates")}</p>
      ) : (
        <CreateTenantForm templates={templates} accounts={accounts} />
      )}
    </>
  );
}
