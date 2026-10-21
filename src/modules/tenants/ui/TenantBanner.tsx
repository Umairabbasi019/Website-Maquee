import Link from "next/link";
import { t } from "@/ui/i18n";

/** Shown to the super admin on every dashboard page, so it is always clear which tenant is being changed. */
export function TenantBanner({ tenantName }: { tenantName: string }) {
  return (
    <section
      aria-label={t("banner.label")}
      className="flex flex-wrap items-center justify-between gap-2 bg-text px-4 py-2 text-bg"
    >
      <p>
        {t("banner.viewing")} <strong>{tenantName}</strong>
      </p>
      <Link
        href="/admin"
        className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
      >
        {t("banner.back")}
      </Link>
    </section>
  );
}
