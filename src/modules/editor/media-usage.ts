import type { SiteDraft } from "./draft";

export type MediaRef = { label: string; key: string; path: (string | number)[] };

/** Every media key the draft uses, where (path into the draft) and under what label. The one list swapMedia, mediaUsage and checkDraft share. */
export function mediaRefs(draft: SiteDraft): MediaRef[] {
  const c = draft.content;
  const ref = (label: string, key: string | null | undefined, ...path: (string | number)[]) => (key ? [{ label, key, path }] : []);
  return [
    ...ref("Logo", draft.theme.logo, "theme", "logo"),
    ...ref("Search preview", c.seo.image, "content", "seo", "image"),
    ...ref("Hero front", c.hero.front.key, "content", "hero", "front", "key"),
    ...ref("Hero hall", c.hero.hall.key, "content", "hero", "hall", "key"),
    ...c.inside.rooms.flatMap((r, i) => ref(`Inside: ${r.chapter}`, r.media.key, "content", "inside", "rooms", i, "media", "key")),
    ...ref("Stage background", c.stage.background.key, "content", "stage", "background", "key"),
    ...ref("Stage reveal", c.stage.reveal.key, "content", "stage", "reveal", "key"),
    ...c.gallery.tiles.flatMap((t, i) => ref("Gallery", t.key, "content", "gallery", "tiles", i, "key")),
    ...ref("Packages background", c.packages.background.key, "content", "packages", "background", "key"),
    ...ref("Contact", c.contact.media.key, "content", "contact", "media", "key"),
    ...draft.events.flatMap((e, i) => ref(`${e.name} background`, e.mediaKey, "events", i, "mediaKey")),
    ...draft.stageThemes.flatMap((t, i) => t.mediaKeys.flatMap((k, j) => ref(`Stage theme: ${t.name}`, k, "stageThemes", i, "mediaKeys", j))),
  ];
}

/** Media key → the distinct labels of the places that use it. */
export function mediaUsage(draft: SiteDraft): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const { key, label } of mediaRefs(draft)) {
    const labels = usage.get(key) ?? [];
    if (!labels.includes(label)) labels.push(label);
    usage.set(key, labels);
  }
  return usage;
}
