import type { Metadata } from "next";
import Link from "next/link";
import { dashboardNav } from "@/modules/access";
import { TenantBanner } from "@/modules/tenants";
import { t } from "@/ui/i18n";
import { buttonClass } from "@/ui/form-styles";
import { signOut } from "../login/actions";
import { changeVenue, selectVenue } from "./actions";
import { getDashboard } from "./context";

// Permissions are read fresh on every request (deactivation must bite at once), so navigation may block. No Suspense
// boundary: React outlines a large completed boundary into a hidden segment only JavaScript reveals (see app/page.tsx),
// and the dashboard forms must work without JavaScript.
export const instant = false;

export const metadata: Metadata = { robots: { index: false, follow: false } };

const linkClass =
  "block rounded-md px-3 py-2 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className={linkClass}>
        {t("signOut")}
      </button>
    </form>
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { viewer, venues, venue, paused } = await getDashboard();

  if (paused || !venue) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        {paused ? (
          <p role="status" className="text-lg">
            {t("venuePaused")}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{t("venue.pick")}</h1>
            {venues.length === 0 && <p className="mt-4">{t("venue.none")}</p>}
            <form action={selectVenue} className="mt-6 space-y-2">
              {venues.map((v) => (
                <button key={v.id} type="submit" name="venue" value={v.id} className={`${buttonClass} block w-full text-left`}>
                  {v.name}
                </button>
              ))}
            </form>
          </>
        )}
        <div className="mt-8">
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <>
      {viewer.isPlatformAdmin && <TenantBanner tenantName={venue.name} />}
      <div className="md:flex md:min-h-screen">
        <aside className="border-b border-muted/40 p-4 md:w-60 md:shrink-0 md:border-r md:border-b-0">
          <p className="px-3 font-semibold">{venue.name}</p>
          <nav aria-label={t("nav.label")} className="mt-3">
            <ul className="flex flex-wrap gap-1 md:block md:space-y-1">
              {dashboardNav(viewer, venue.id).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass}>
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-3 flex flex-wrap gap-1 border-t border-muted/40 pt-3 md:block">
            {venues.length > 1 && (
              <form action={changeVenue}>
                <button type="submit" className={linkClass}>
                  {t("venue.change")}
                </button>
              </form>
            )}
            <SignOutButton />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </>
  );
}
