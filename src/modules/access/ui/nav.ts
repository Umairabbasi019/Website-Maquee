import type { TranslationKey } from "@/ui/i18n";
import type { PermissionKey } from "../permissions";
import { can, type Viewer } from "../server/can";

/** The `/dashboard` table in docs/SITEMAP.md. Keep both in step. */
export const DASHBOARD_SCREENS: readonly { href: string; labelKey: TranslationKey; perm: PermissionKey }[] = [
  { href: "/dashboard", labelKey: "nav.overview", perm: "bookings.view" },
  { href: "/dashboard/bookings", labelKey: "nav.bookings", perm: "bookings.view" },
  { href: "/dashboard/calendar", labelKey: "nav.calendar", perm: "bookings.view" },
  { href: "/dashboard/enquiries", labelKey: "nav.enquiries", perm: "enquiries.handle" },
  { href: "/dashboard/payments", labelKey: "nav.payments", perm: "payments.view" },
  { href: "/dashboard/schedule", labelKey: "nav.schedule", perm: "schedule.view_own" },
  { href: "/dashboard/catalogue", labelKey: "nav.catalogue", perm: "catalogue.edit" },
  { href: "/dashboard/marketing", labelKey: "nav.marketing", perm: "marketing.send" },
  { href: "/dashboard/reports", labelKey: "nav.reports", perm: "reports.view" },
  { href: "/dashboard/media", labelKey: "nav.media", perm: "media.manage" },
  { href: "/dashboard/users", labelKey: "nav.users", perm: "users.manage" },
  { href: "/dashboard/settings", labelKey: "nav.settings", perm: "tenant.settings.edit" },
  { href: "/dashboard/audit", labelKey: "nav.audit", perm: "audit.view" },
];

/** Screens the viewer may open in this tenant. Hiding is UX only: each page checks again. */
export function dashboardNav(viewer: Viewer, tenantId: string): { href: string; labelKey: TranslationKey }[] {
  return DASHBOARD_SCREENS.filter((s) => can(viewer, tenantId, s.perm)).map(({ href, labelKey }) => ({ href, labelKey }));
}
