"use client";
import { t } from "@/ui/i18n";
import { CheckField, ItemButtons, move } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

/** Super admin: which sections show, and their order. Saved as one list, so a reorder never passes through a duplicate. */
export function SectionsOrderPanel(p: SettingsProps) {
  return (
    <SettingsPanel {...p} initial={p.draft.sections} toChanges={(sections) => ({ changes: [{ part: "sections", path: [], value: sections }] })}>
      {({ form, setForm }) => (
        <ol className="space-y-2">
          {form.map((s, i) => (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <CheckField
                label={t("field.visible", { name: s.key })}
                checked={s.visible}
                onChange={(visible) => setForm(form.map((x, j) => (j === i ? { ...x, visible } : x)))}
              />
              <ItemButtons label={s.key} i={i} count={form.length} onMove={(to) => setForm(move(form, i, to))} />
            </li>
          ))}
        </ol>
      )}
    </SettingsPanel>
  );
}
