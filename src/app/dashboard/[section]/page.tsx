import { notFound } from "next/navigation";
import { can, DASHBOARD_SCREENS } from "@/modules/access";
import { t } from "@/ui/i18n";
import { ComingSoon, Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";

export const instant = false; // see layout.tsx

// shortcut: one placeholder route for every screen in DASHBOARD_SCREENS; each milestone (M3–M6)
// adds a real route folder for its screen, which Next matches before this dynamic segment.
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const screen = DASHBOARD_SCREENS.find((s) => s.href === `/dashboard/${section}`);
  if (!screen) notFound();
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  if (!can(viewer, venue.id, screen.perm)) return <Forbidden />;
  return <ComingSoon title={t(screen.labelKey)} />;
}
