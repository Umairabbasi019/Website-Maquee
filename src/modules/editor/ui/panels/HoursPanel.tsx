"use client";
import { t } from "@/ui/i18n";
import { CheckField, TextField, type Errors } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

type Day = { closed: boolean; open: string; close: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// 1 Jan 2023 was a Sunday; day 0 is Sunday, as in openingHours.
const dayName = (day: number) => new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2023, 0, 1 + day));

/** Opening hours per weekday: closed, or open and close times. A close earlier than the open runs past midnight. */
export function HoursPanel(p: SettingsProps) {
  // shortcut: only a day's first window is editable; later windows (stored by hand) are kept as they are, and
  // dropped only when the day is marked closed. Make each day a list if a venue needs split hours.
  const hours = p.draft.identity.openingHours;
  const extra = hours.filter((h, i) => hours.findIndex((x) => x.day === h.day) !== i);
  const initial: Day[] = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const h = hours.find((x) => x.day === day);
    return h ? { closed: false, open: h.open, close: h.close } : { closed: true, open: "", close: "" };
  });
  return (
    <SettingsPanel
      {...p}
      initial={initial}
      toChanges={(days) => {
        const errors: Errors = {};
        days.forEach((d, i) => {
          if (d.closed) return;
          if (!TIME.test(d.open)) errors[`hours.${i}.open`] = t("editor.error.required");
          if (!TIME.test(d.close)) errors[`hours.${i}.close`] = t("editor.error.required");
        });
        const value = days.flatMap((d, day) => (d.closed ? [] : [{ day, open: d.open, close: d.close }, ...extra.filter((x) => x.day === day)]));
        return { changes: [{ part: "identity", path: ["openingHours"], value }], errors };
      }}
    >
      {({ form, setForm, errors }) =>
        form.map((d, i) => {
          const set = (patch: Partial<Day>) => setForm(form.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <fieldset key={i} className="space-y-2 rounded-md border border-muted/40 p-3">
              <legend className="px-1 font-medium">{dayName(i)}</legend>
              <CheckField label={t("field.closed")} checked={d.closed} onChange={(closed) => set({ closed })} />
              {!d.closed && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField label={t("field.opens")} type="time" value={d.open} onChange={(open) => set({ open })} error={errors[`hours.${i}.open`]} />
                  <TextField label={t("field.closes")} type="time" value={d.close} onChange={(close) => set({ close })} error={errors[`hours.${i}.close`]} />
                </div>
              )}
              {!d.closed && extra.some((x) => x.day === i) && <p className="text-sm text-muted">{t("field.hoursExtra")}</p>}
              {!d.closed && TIME.test(d.open) && TIME.test(d.close) && d.close <= d.open && <p className="text-sm text-muted">{t("field.hoursHint")}</p>}
            </fieldset>
          );
        })
      }
    </SettingsPanel>
  );
}
