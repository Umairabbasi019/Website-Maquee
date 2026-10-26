"use client";
import type { MediaView } from "@/modules/media/client";
import { t } from "@/ui/i18n";
import { MediaField, type Upload } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

type Tile = { key: string; ratio: number };

/**
 * The gallery's photo tiles in order (at least 4, the schema minimum). A tile keeps its ratio; a new one takes its
 * photo's own shape, rounded to 2 decimals.
 */
export function GalleryPanel({ media, upload, ...p }: SettingsProps & { media: MediaView[]; upload?: Upload }) {
  const tiles = p.draft.content.gallery.tiles;
  const ratioOf = (key: string) =>
    // shortcut: a photo with no stored size counts as square; such photos predate size tracking, re-upload them to fix the shape.
    tiles.find((x) => x.key === key)?.ratio ?? Math.round((media.find((m) => m.key === key)?.aspect ?? 1) * 100) / 100;
  return (
    <SettingsPanel
      {...p}
      initial={{ keys: tiles.map((x) => x.key) }}
      toChanges={(f) => ({ changes: [{ part: "content", path: ["gallery", "tiles"], value: f.keys.map((key): Tile => ({ key, ratio: ratioOf(key) })) }] })}
    >
      {({ form, set, errors }) => (
        <MediaField
          label={t("field.tiles")}
          keys={form.keys}
          max={Infinity}
          media={media}
          upload={upload}
          onChange={(update) => set("keys", update(form.keys))}
          error={errors["content.gallery.tiles"]}
        />
      )}
    </SettingsPanel>
  );
}
