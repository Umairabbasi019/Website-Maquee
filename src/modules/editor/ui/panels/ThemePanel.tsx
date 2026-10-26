"use client";
import type { MediaView } from "@/modules/media/client";
import { t, type TranslationKey } from "@/ui/i18n";
import type { SiteDraft } from "../../draft";
import { MediaField, SelectField, TextField, type Upload } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

type Theme = SiteDraft["theme"];
type Color = keyof Theme["colors"];

const COLORS: [Color, TranslationKey][] = [
  ["primary", "field.color.primary"],
  ["background", "field.color.background"],
  ["text", "field.color.text"],
  ["muted", "field.color.muted"],
  ["deep", "field.color.deep"],
];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Super admin: the five site colours (picker plus hex), heading and body fonts, and the logo. */
export function ThemePanel({ fonts, media, upload, ...p }: SettingsProps & { fonts: readonly string[]; media: MediaView[]; upload?: Upload }) {
  const theme = p.draft.theme;
  // A font set before the site stopped loading it stays choosable, so opening the panel never changes it.
  const options = (current: string) => [...new Set([current, ...fonts])].map((f) => ({ value: f, label: f }));
  return (
    <SettingsPanel
      {...p}
      initial={theme}
      toChanges={(f) => ({
        changes: [
          { part: "theme", path: ["colors"], value: f.colors },
          { part: "theme", path: ["fonts"], value: f.fonts },
          { part: "theme", path: ["logo"], value: f.logo },
        ],
      })}
    >
      {({ form, set, errors }) => (
        <>
          {COLORS.map(([color, label]) => {
            const value = form.colors[color];
            const setColor = (v: string) => set("colors", { ...form.colors, [color]: v });
            return (
              <div key={color} className="flex items-end gap-2">
                <input
                  type="color"
                  aria-label={t("field.colorPicker", { label: t(label) })}
                  value={HEX.test(value) ? value.toLowerCase() : "#000000"}
                  onChange={(e) => setColor(e.target.value)}
                  className="mb-1 h-10 w-12 shrink-0 rounded border border-muted"
                />
                <div className="min-w-0 flex-1">
                  <TextField label={t(label)} value={value} onChange={setColor} error={errors[`theme.colors.${color}`]} />
                </div>
              </div>
            );
          })}
          <SelectField label={t("field.headingFont")} value={form.fonts.heading} options={options(theme.fonts.heading)} onChange={(v) => set("fonts", { ...form.fonts, heading: v })} />
          <SelectField label={t("field.bodyFont")} value={form.fonts.body} options={options(theme.fonts.body)} onChange={(v) => set("fonts", { ...form.fonts, body: v })} />
          <MediaField
            label={t("field.logo")}
            keys={form.logo ? [form.logo] : []}
            max={1}
            media={media}
            upload={upload}
            onChange={(update) => set("logo", update(form.logo ? [form.logo] : [])[0])}
            error={errors["theme.logo"]}
          />
        </>
      )}
    </SettingsPanel>
  );
}
