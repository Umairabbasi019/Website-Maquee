import Link from "next/link";
import { listTenants } from "@/modules/tenants";
import { t } from "@/ui/i18n";
import { buttonClass } from "@/ui/form-styles";
import { Forbidden } from "@/ui/notices";
import { formatWhen } from "./format";
import { adminGate } from "./guard";

export const instant = false; // see layout.tsx

const cell = "border-b border-muted/40 px-3 py-2 text-left";

export default async function AdminHome() {
  if (!(await adminGate())) return <Forbidden />;
  const tenants = await listTenants();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("admin.tenants")}</h1>
        <Link href="/admin/tenants/new" className={buttonClass}>
          {t("admin.newTenant")}
        </Link>
      </div>
      {tenants.length === 0 ? (
        <p className="mt-6">{t("admin.none")}</p>
      ) : (
        // Scrolls sideways on a phone; focusable so keyboard users can scroll it too.
        <div role="region" aria-label={t("admin.tenants")} tabIndex={0} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                {(
                  [
                    "admin.col.name",
                    "admin.col.status",
                    "admin.col.domain",
                    "admin.col.activity",
                    "admin.col.checklist",
                  ] as const
                ).map((key) => (
                  <th key={key} scope="col" className={`${cell} font-semibold`}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <th scope="row" className={`${cell} font-medium`}>
                    <Link href={`/admin/tenants/${tenant.id}`} className="underline">
                      {tenant.name}
                    </Link>
                  </th>
                  <td className={cell}>{t(`status.${tenant.status}`)}</td>
                  <td className={cell}>{tenant.domain}</td>
                  <td className={cell}>{tenant.lastActivity ? formatWhen(tenant.lastActivity) : t("admin.never")}</td>
                  <td className={cell}>
                    {tenant.checklist.filter((i) => i.done).length}/{tenant.checklist.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
