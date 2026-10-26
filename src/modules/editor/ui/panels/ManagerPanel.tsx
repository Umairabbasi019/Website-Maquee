"use client";
import { t } from "@/ui/i18n";
import { TextField } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

const PATH = "content.contact.manager";

/** The manager card beside the enquiry form: name, role and when they reply. */
export function ManagerPanel(p: SettingsProps) {
  return (
    <SettingsPanel
      {...p}
      initial={p.draft.content.contact.manager}
      toChanges={(f) => ({
        changes: [{ part: "content", path: ["contact", "manager"], value: { name: f.name.trim(), role: f.role.trim(), replyNote: f.replyNote.trim() } }],
      })}
    >
      {({ form, set, errors }) => (
        <>
          <TextField label={t("field.name")} value={form.name} onChange={(v) => set("name", v)} error={errors[`${PATH}.name`]} />
          <TextField label={t("field.role")} value={form.role} onChange={(v) => set("role", v)} error={errors[`${PATH}.role`]} />
          <TextField label={t("field.replyNote")} value={form.replyNote} onChange={(v) => set("replyNote", v)} error={errors[`${PATH}.replyNote`]} />
        </>
      )}
    </SettingsPanel>
  );
}
