"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId } from "react";
import type { MediaView } from "@/modules/media/client";
import type { SectionKey, SiteContent } from "@/modules/tenants/client";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import type { Upload } from "../fields";
import { FieldsForm } from "../FieldsForm";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

export type DepthState = { ok: TranslationKey } | { error: TranslationKey } | null;
/** Uploads a depth map (`file`) for the photo `key`; the server checks tenant.settings.edit and the photo's shape. */
export type DepthAction = (prev: DepthState, fd: FormData) => Promise<DepthState>;

type Obj = Record<string, unknown>;
type Hero = SiteContent["hero"];

/** One section's copy and photos, as a form of the section's own shape (FieldsForm), checked with its schema on Save. */
export function SectionPanel({
  section,
  media,
  upload,
  depthUpload,
  ...p
}: SettingsProps & { section: SectionKey; media: MediaView[]; upload?: Upload; depthUpload?: DepthAction }) {
  const initial = p.draft.content[section] as Obj;
  return (
    <SettingsPanel
      {...p}
      initial={initial}
      toChanges={(value) => ({ changes: [{ part: "content", path: [section], value }] })}
      after={({ form, setForm }) =>
        section === "hero" && depthUpload ? (
          <DepthOffer hero={form as Hero} was={initial as Hero} media={media} action={depthUpload} onPhotos={() => setForm({ ...form, mode: "photos" })} />
        ) : null
      }
    >
      {({ form, setForm, errors }) => <FieldsForm value={form} onChange={setForm} media={media} upload={upload} errors={errors} path={`content.${section}`} />}
    </SettingsPanel>
  );
}

/** In depth mode, a newly picked hero photo needs its own depth map: upload one, or switch the hero to plain photos. */
function DepthOffer({ hero, was, media, action, onPhotos }: { hero: Hero; was: Hero; media: MediaView[]; action: DepthAction; onPhotos: () => void }) {
  if (hero.mode !== "depth") return null;
  const missing = (["front", "hall"] as const).filter((spot) => hero[spot].key !== was[spot].key && !media.find((m) => m.key === hero[spot].key)?.depthUrl);
  if (!missing.length) return null;
  return (
    <div className="mt-4 space-y-4 border-t border-muted/40 pt-4">
      {missing.map((spot) => (
        <DepthForm key={spot} spot={spot} photoKey={hero[spot].key} action={action} />
      ))}
      <button type="button" className="rounded-md border border-muted px-4 py-2 font-medium hover:bg-accent/20" onClick={onPhotos}>
        {t("editor.depth.switch")}
      </button>
    </div>
  );
}

function DepthForm({ spot, photoKey, action }: { spot: string; photoKey: string; action: DepthAction }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  // The new map shows once the page's media list is read again.
  useEffect(() => {
    if (state && "ok" in state) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className="space-y-2">
      <p className="font-medium">{t("editor.depth.missing", { label: spot })}</p>
      <input type="hidden" name="key" value={photoKey} />
      <label htmlFor={id} className="block">
        {t("editor.depth.file")}
      </label>
      <input id={id} name="file" type="file" required accept="image/png" className={inputClass} />
      {state && "error" in state && (
        <p role="alert" className="text-sm font-medium text-red-800">
          {t(state.error)}
        </p>
      )}
      {state && "ok" in state && <p role="status">{t(state.ok)}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("editor.working") : t("editor.depth.upload")}
      </button>
    </form>
  );
}
