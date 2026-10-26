"use client";
import { t } from "@/ui/i18n";
import type { FormState } from "./actions";

/** The result line under a settings form. Errors carry `id` so the fields can point at them. */
export function FormStatus({ id, state }: { id: string; state: FormState }) {
  if (!state) return null;
  if ("ok" in state) return <p role="status">{t(state.ok)}</p>;
  return (
    <p id={id} role="alert" className="rounded-md border border-text px-3 py-2">
      {t(state.error)}
    </p>
  );
}

export const confirmDelete = (e: React.FormEvent) => {
  if (!window.confirm(t("settings.deleteConfirm"))) e.preventDefault();
};
