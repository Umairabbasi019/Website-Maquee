import { can, canAny, DASHBOARD_SCREENS } from "@/modules/access";
import { listDatePrices } from "@/modules/calendar";
import { getPublicCatalogue } from "@/modules/catalogue";
import { getMoneyRules, listHalls, listSlots } from "@/modules/tenants";
import { t, type TranslationKey } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";
import { DatePricesForm } from "./date-prices-form";
import { HallsForm } from "./halls-form";
import { MoneyRulesForm } from "./money-rules-form";
import { SlotsForm } from "./slots-form";

export const instant = false; // see layout.tsx

function Section({ id, title, note, children }: { id: string; title: TranslationKey; note?: TranslationKey; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 space-y-4">
      <h2 id={id} className="text-xl font-semibold">
        {t(title)}
      </h2>
      {note && <p>{t(note)}</p>}
      {children}
    </section>
  );
}

// Each section shows only to holders of its key; the module functions and RLS check again on save.
export default async function SettingsPage() {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  const screen = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/settings")!;
  if (!canAny(viewer, venue.id, screen.perm)) return <Forbidden />;

  const setup = can(viewer, venue.id, "tenant.settings.edit");
  const halls = setup || can(viewer, venue.id, "prices.edit");
  const dates = can(viewer, venue.id, "calendar.manage");
  const [hallRows, slots, prices, catalogue, rules] = await Promise.all([
    halls ? listHalls(venue.id) : null,
    setup ? listSlots(venue.id) : null,
    dates ? listDatePrices(venue.id) : null,
    dates ? getPublicCatalogue(venue.id) : null,
    halls ? getMoneyRules(venue.id) : null,
  ]);

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("nav.settings")}</h1>
      <p className="mt-2">{t("settings.intro")}</p>
      {hallRows && (
        <Section id="settings-halls" title="settings.halls">
          <HallsForm halls={hallRows} full={setup} />
        </Section>
      )}
      {slots && (
        <Section id="settings-slots" title="settings.slots" note="settings.slots.note">
          <SlotsForm slots={slots} />
        </Section>
      )}
      {prices && catalogue && (
        <Section id="settings-date-prices" title="settings.datePrices" note="settings.datePrices.note">
          <DatePricesForm prices={prices} events={catalogue.events.map(({ id, name }) => ({ id, name }))} />
        </Section>
      )}
      {rules && (
        <Section id="settings-money" title="settings.moneyRules">
          <MoneyRulesForm rules={rules} full={setup} />
        </Section>
      )}
    </section>
  );
}
