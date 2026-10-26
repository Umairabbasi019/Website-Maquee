import type { Metadata } from "next";
import { canAny, DASHBOARD_SCREENS } from "@/modules/access";
import { getDraftView } from "@/modules/editor";
import { SiteShell } from "@/modules/site";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../dashboard/context";

// Reads the session on every request, like the dashboard.
export const instant = false;

export const metadata: Metadata = { robots: { index: false, follow: false } };

const SCREEN = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/site")!;

/** The draft as visitors would see it (public mode, full motion), for the editor's phone preview frame. */
export default async function SitePreviewPage() {
  const { viewer, venue } = await getDashboard();
  if (!venue || !canAny(viewer, venue.id, SCREEN.perm)) return <Forbidden />;
  // No edit markers: the frame shows exactly what Publish would put live.
  return <SiteShell site={{ ...(await getDraftView(venue.id)), editing: undefined }} />;
}
