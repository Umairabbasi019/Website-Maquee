import { can, canAny, DASHBOARD_SCREENS, PERMISSIONS } from "@/modules/access";
import { EditorBar, EditOverlay, getDraft, getDraftView, sampleReport } from "@/modules/editor";
import { categoriesFor } from "@/modules/media";
import { SiteShell } from "@/modules/site";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";
import { uploadPhoto } from "../media/actions";
import { discard, publish, saveChange } from "./actions";

export const instant = false; // see layout.tsx

const SCREEN = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/site")!;

/** The on-page editor: the venue's draft rendered as the site, with ✎ buttons for what this viewer may change. */
export default async function EditSitePage() {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  if (!canAny(viewer, venue.id, SCREEN.perm)) return <Forbidden />;
  const [{ draft, revision, changes }, site] = await Promise.all([getDraft(venue.id), getDraftView(venue.id)]);
  const keys = PERMISSIONS.filter((k) => can(viewer, venue.id, k));
  const { events, packages, offers, addons, stageThemes } = draft;

  return (
    <EditorBar revision={revision} changeCount={Object.keys(changes).length} sample={sampleReport(draft)} publish={publish} discard={discard}>
      <SiteShell site={site} mode="edit" />
      <EditOverlay
        keys={keys}
        rows={{ events, packages, offers, addons, stageThemes }}
        changes={changes}
        media={Object.values(site.media)}
        upload={keys.includes("media.manage") ? { action: uploadPhoto, categories: categoriesFor(viewer, venue.id) } : undefined}
        save={saveChange}
      />
    </EditorBar>
  );
}
