import type { TenantSettings } from "./settings";

export type ChecklistItem = {
  item: "domain" | "contacts" | "halls" | "prices" | "photos" | "payments";
  done: boolean;
};

export function setupChecklist(
  settings: Pick<TenantSettings, "identity">,
  counts: { domains: number; halls: number; packages: number; heroMedia: number; paymentAccounts: number },
): ChecklistItem[] {
  return [
    { item: "domain", done: counts.domains > 0 },
    { item: "contacts", done: settings.identity.phones.length > 0 },
    { item: "halls", done: counts.halls > 0 },
    { item: "prices", done: counts.packages > 0 },
    { item: "photos", done: counts.heroMedia > 0 },
    { item: "payments", done: counts.paymentAccounts > 0 },
  ];
}
