import { can } from "@/modules/access";
import { categoriesFor, getPublicMedia, UploadForm } from "@/modules/media";
import { t } from "@/ui/i18n";
import { Forbidden } from "@/ui/notices";
import { getDashboard } from "../context";
import { uploadPhoto } from "./actions";
import { MediaGrid } from "./media-grid";
import { mediaUsedIn } from "./usage";

export const instant = false; // see layout.tsx

export default async function MediaPage() {
  const { viewer, venue } = await getDashboard();
  if (!venue) return null;
  if (!can(viewer, venue.id, "media.manage")) return <Forbidden />;
  const [media, usage] = await Promise.all([getPublicMedia(venue.id), mediaUsedIn(venue.id)]);
  const items = Object.values(media)
    .map((m) => ({ key: m.key, alt: m.alt, thumb: m.urls.s ?? m.urls.m ?? m.urls.l, usedIn: usage.get(m.key) ?? [] }))
    .sort((a, b) => a.alt.localeCompare(b.alt));

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("nav.media")}</h1>
      <section aria-labelledby="media-upload" className="mt-6 space-y-4">
        <h2 id="media-upload" className="text-xl font-semibold">
          {t("media.uploadHeading")}
        </h2>
        <UploadForm action={uploadPhoto} categories={categoriesFor(viewer, venue.id)} />
      </section>
      <section aria-labelledby="media-library" className="mt-10">
        <h2 id="media-library" className="text-xl font-semibold">
          {t("media.library")}
        </h2>
        <MediaGrid items={items} />
      </section>
    </section>
  );
}
