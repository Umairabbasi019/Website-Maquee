import { can, canAny, DASHBOARD_SCREENS, PERMISSIONS } from "@/modules/access";
import { EditorBar, EditOverlay, getDraft, getDraftView, sampleReport } from "@/modules/editor";
import { categoriesFor } from "@/modules/media";
import { FONT_NAMES, SiteShell } from "@/modules/site";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";
import { uploadDepthMap, uploadPhoto } from "../media/actions";
import { discard, markContentReal, publish, saveChange } from "./actions";

export const instant = false; // see layout.tsx

const SCREEN = DASHBOARD_SCREENS.find((s) => s.href === "/dashboard/site")!;

/** The on-page editor: the venue's draft rendered as the site, with ✎ buttons for what this viewer may change. */
export default async function EditSitePage() {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  if (!canAny(viewer, venue.id, SCREEN.perm)) return <Forbidden />;
  const [{ draft, revision, changes }, site] = await Promise.all([getDraft(venue.id), getDraftView(venue.id)]);
  const keys = PERMISSIONS.filter((k) => can(viewer, venue.id, k));
  const superAdmin = keys.includes("tenant.settings.edit");

  return (
    <EditorBar
      revision={revision}
      changeCount={Object.keys(changes).length}
      sample={sampleReport(draft)}
      publish={publish}
      discard={discard}
      markReal={superAdmin ? markContentReal : undefined}
    >
      <SiteShell site={site} mode="edit" />
      <EditOverlay
        keys={keys}
        draft={draft}
        changes={changes}
        media={Object.values(site.media)}
        upload={keys.includes("media.manage") ? { action: uploadPhoto, categories: categoriesFor(viewer, venue.id) } : undefined}
        depthUpload={superAdmin ? uploadDepthMap : undefined}
        fonts={FONT_NAMES}
        save={saveChange}
      />
    </EditorBar>
  );
}
