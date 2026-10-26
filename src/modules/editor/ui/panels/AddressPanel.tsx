"use client";
import { t } from "@/ui/i18n";
import { TextField } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

/** The address text the directions link searches for when the venue has no map location. */
export function AddressPanel(p: SettingsProps) {
  return (
    <SettingsPanel
      {...p}
      initial={{ address: p.draft.identity.address ?? "" }}
      toChanges={(f) => ({ changes: [{ part: "identity", path: ["address"], value: f.address.trim() || undefined }] })}
    >
      {({ form, set, errors }) => (
        <TextField label={t("field.address")} multiline value={form.address} onChange={(v) => set("address", v)} error={errors["identity.address"]} />
      )}
    </SettingsPanel>
  );
}
