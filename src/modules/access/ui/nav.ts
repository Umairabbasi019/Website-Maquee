import type { TranslationKey } from "@/ui/i18n";
import type { PermissionKey } from "../permissions";
import { can, type Viewer } from "../server/can";

/** One key, or several of which any one is enough. */
type ScreenPerm = PermissionKey | readonly PermissionKey[];

/** The `/dashboard` table in docs/SITEMAP.md. Keep both in step. */
export const DASHBOARD_SCREENS: readonly { href: string; labelKey: TranslationKey; perm: ScreenPerm }[] = [
  { href: "/dashboard", labelKey: "nav.overview", perm: "bookings.view" },
  { href: "/dashboard/bookings", labelKey: "nav.bookings", perm: "bookings.view" },
  { href: "/dashboard/calendar", labelKey: "nav.calendar", perm: "bookings.view" },
  { href: "/dashboard/enquiries", labelKey: "nav.enquiries", perm: "enquiries.handle" },
  { href: "/dashboard/payments", labelKey: "nav.payments", perm: "payments.view" },
  { href: "/dashboard/schedule", labelKey: "nav.schedule", perm: "schedule.view_own" },
  { href: "/dashboard/marketing", labelKey: "nav.marketing", perm: "marketing.send" },
  { href: "/dashboard/reports", labelKey: "nav.reports", perm: "reports.view" },
  { href: "/dashboard/site", labelKey: "nav.site", perm: ["catalogue.edit", "prices.edit", "venue.info.edit", "tenant.settings.edit"] },
  { href: "/dashboard/media", labelKey: "nav.media", perm: "media.manage" },
  { href: "/dashboard/users", labelKey: "nav.users", perm: "users.manage" },
  { href: "/dashboard/settings", labelKey: "nav.settings", perm: ["tenant.settings.edit", "calendar.manage", "prices.edit"] },
  { href: "/dashboard/audit", labelKey: "nav.audit", perm: "audit.view" },
];

export function canAny(viewer: Viewer, tenantId: string, perm: ScreenPerm): boolean {
  return (typeof perm === "string" ? [perm] : perm).some((p) => can(viewer, tenantId, p));
}

/** Screens the viewer may open in this tenant. Hiding is UX only: each page checks again. */
export function dashboardNav(viewer: Viewer, tenantId: string): { href: string; labelKey: TranslationKey }[] {
  return DASHBOARD_SCREENS.filter((s) => canAny(viewer, tenantId, s.perm)).map(({ href, labelKey }) => ({ href, labelKey }));
}
