"use client";
import { t } from "@/ui/i18n";
import { ListField } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

/** The venue's phone numbers, at least one; the first is the one the site calls. */
export function PhonesPanel(p: SettingsProps) {
  return (
    <SettingsPanel
      {...p}
      initial={{ phones: p.draft.identity.phones }}
      toChanges={(f) => {
        const phones = f.phones.map((s) => s.trim());
        return {
          changes: [{ part: "identity", path: ["phones"], value: phones }],
          errors: phones.length ? undefined : { "identity.phones": t("editor.error.minItems", { min: 1 }) },
        };
      }}
    >
      {({ form, set, errors }) => (
        <ListField
          label={t("field.phones")}
          itemLabel={t("field.phone")}
          addLabel={t("field.phones.add")}
          items={form.phones}
          onChange={(v) => set("phones", v)}
          errors={errors}
          path="identity.phones"
        />
      )}
    </SettingsPanel>
  );
}
