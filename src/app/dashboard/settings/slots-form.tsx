"use client";
import { useActionState, useId } from "react";
import type { Slot } from "@/modules/tenants";
import { buttonClass, inputClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { deleteSlotAction, saveSlotAction } from "./actions";
import { confirmDelete, FormStatus } from "./form-status";

function SlotForm({ slot }: { slot?: Slot }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveSlotAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSlotAction, null);
  const error = state && "error" in state;
  const field = { "aria-invalid": error || undefined, "aria-describedby": error ? `${id}-error` : undefined, className: inputClass };

  return (
    <div className="space-y-3 rounded-lg border border-muted/40 p-4">
      <form action={action} aria-label={slot?.name ?? t("settings.slots.new")} className="space-y-3">
        {slot && <input type="hidden" name="id" value={slot.id} />}
        <label className="block">
          {t("settings.slot.name")}
          <input name="name" required maxLength={60} defaultValue={slot?.name} {...field} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            {t("settings.slot.start")}
            <input name="start" type="time" required defaultValue={slot?.start} {...field} />
          </label>
          <label className="block">
            {t("settings.slot.end")}
            <input name="end" type="time" required defaultValue={slot?.end} {...field} />
          </label>
          <label className="block">
            {t("settings.slot.buffer")}
            <input name="bufferMinutes" type="number" min={0} required defaultValue={slot?.bufferMinutes ?? 0} {...field} />
          </label>
        </div>
        <FormStatus id={`${id}-error`} state={state} />
        <button type="submit" disabled={pending} className={buttonClass}>
          {slot ? t("settings.save") : t("settings.add")}
        </button>
      </form>
      {slot && (
        <form action={deleteAction} onSubmit={confirmDelete}>
          <input type="hidden" name="id" value={slot.id} />
          <FormStatus id={`${id}-delete-error`} state={deleteState} />
          <button type="submit" disabled={deletePending} className={buttonClass}>
            {t("settings.delete")}
          </button>
        </form>
      )}
    </div>
  );
}

export function SlotsForm({ slots }: { slots: Slot[] }) {
  return (
    <div className="space-y-4">
      {slots.map((s) => (
        <SlotForm key={s.id} slot={s} />
      ))}
      <SlotForm />
    </div>
  );
}
