import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTenantDetail, listSecretMeta, SECRET_KINDS, TENANT_STATUSES } from "@/modules/tenants";
import { t } from "@/ui/i18n";
import { buttonClass } from "@/ui/form-styles";
import { Forbidden } from "@/ui/notices";
import { formatWhen } from "../../format";
import { adminGate } from "../../guard";
import { setTenantFeature, setTenantStatus } from "./actions";
import { LimitsForm, SecretForm } from "./forms";

export const instant = false; // see ../../layout.tsx

const section = "mt-10";
const h2 = "text-xl font-semibold";
const secondaryButton =
  "rounded-md border border-text px-3 py-1 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!(await adminGate())) return <Forbidden />;
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();
  const [tenant, secrets] = await Promise.all([getTenantDetail(id.data), listSecretMeta(id.data)]);
  if (!tenant) notFound();

  return (
    <>
      <Link href="/admin" className="underline">
        {t("admin.back")}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{tenant.name}</h1>
          <p className="mt-1">
            {tenant.domain} · {t("admin.status")}:{" "}
            <span data-testid="tenant-status">{t(`status.${tenant.status}`)}</span>
          </p>
          <p className="mt-1">
            {t("admin.col.activity")}: {tenant.lastActivity ? formatWhen(tenant.lastActivity) : t("admin.never")}
          </p>
        </div>
        <Link href={`/dashboard?tenant=${tenant.id}`} className={buttonClass}>
          {t("admin.openDashboard")}
        </Link>
      </div>

      <section aria-labelledby="checklist" className={section}>
        <h2 id="checklist" className={h2}>
          {t("admin.checklist")} ({tenant.checklist.filter((i) => i.done).length}/{tenant.checklist.length})
        </h2>
        <ul className="mt-4 space-y-1">
          {tenant.checklist.map((i) => (
            <li key={i.item}>
              {t(`checklist.${i.item}`)}: <strong>{i.done ? t("admin.done") : t("admin.missing")}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="status" className={section}>
        <h2 id="status" className={h2}>
          {t("admin.status")}
        </h2>
        <p className="mt-2">{t("admin.pauseHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TENANT_STATUSES.filter((s) => s !== tenant.status).map((s) => (
            <form key={s} action={setTenantStatus.bind(null, tenant.id, s)}>
              <button type="submit" className={secondaryButton}>
                {t(`admin.setStatus.${s}`)}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section aria-labelledby="features" className={section}>
        <h2 id="features" className={h2}>
          {t("admin.features")}
        </h2>
        {tenant.features.length === 0 ? (
          <p className="mt-4">{t("admin.noFeatures")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {tenant.features.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-3">
                <code>{f.key}</code>
                <span>{f.enabled ? t("admin.featureOn") : t("admin.featureOff")}</span>
                <form action={setTenantFeature.bind(null, tenant.id, f.key, !f.enabled)}>
                  <button
                    type="submit"
                    aria-label={`${f.enabled ? t("admin.turnOff") : t("admin.turnOn")}: ${f.key}`}
                    className={secondaryButton}
                  >
                    {f.enabled ? t("admin.turnOff") : t("admin.turnOn")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="limits" className={section}>
        <h2 id="limits" className={h2}>
          {t("admin.limits")}
        </h2>
        <p className="mt-2">
          {t("admin.activeNow")}: {tenant.activeMembers} {t("admin.activeUsers")}, {tenant.activeManagers}{" "}
          {t("admin.activeManagers")}
        </p>
        <LimitsForm tenantId={tenant.id} loginLimit={tenant.loginLimit} managerLimit={tenant.managerLimit} />
      </section>

      <section aria-labelledby="secrets" className={section}>
        <h2 id="secrets" className={h2}>
          {t("admin.secrets")}
        </h2>
        <p className="mt-2">{t("admin.secretsIntro")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {SECRET_KINDS.map((kind) => {
            const saved = secrets.find((s) => s.kind === kind);
            return (
              <SecretForm
                key={kind}
                tenantId={tenant.id}
                kind={kind}
                savedOn={saved ? formatWhen(saved.updatedAt) : null}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}
