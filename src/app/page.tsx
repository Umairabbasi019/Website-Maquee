import { t } from "@/ui/i18n";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl">{t("home.heading")}</h1>
    </main>
  );
}
