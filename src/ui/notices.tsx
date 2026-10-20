import { t } from "@/ui/i18n";

export function Forbidden() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("forbidden.heading")}</h1>
      <p className="mt-2">{t("forbidden.body")}</p>
    </section>
  );
}

/** Honest empty state for a screen that a later milestone builds. No buttons: nothing works yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6 rounded-lg border border-muted/40 p-6">
        <p className="font-medium">{t("comingSoon.heading")}</p>
        <p className="mt-1">{t("comingSoon.body")}</p>
      </div>
    </section>
  );
}
