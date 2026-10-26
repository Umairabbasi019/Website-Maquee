"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import type { PermissionKey } from "@/modules/access";
import { ROW_VALUE_SCHEMAS } from "@/modules/catalogue/client";
import { buttonClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import { ROW_TABLES, type RowKind } from "../draft";
import { fieldKey } from "../keys";
import type { DraftChanges } from "../server/draft";
import { issueErrors, type Errors } from "./fields";

export type ActionResult = { ok: true } | { error: TranslationKey; items?: string[] };
export type SaveAction = (change: unknown) => Promise<ActionResult>;

/** What every catalogue panel gets from the overlay. */
export type PanelProps = {
  title: string;
  keys: readonly PermissionKey[];
  change?: DraftChanges[string];
  save: SaveAction;
  /** Saved or removed: the overlay closes the panel and announces `message`. */
  onDone: (message: string) => void;
  onClose: () => void;
};

const NEEDS: Partial<Record<PermissionKey, TranslationKey>> = {
  "prices.edit": "editor.needs.prices",
  "catalogue.edit": "editor.needs.catalogue",
  "tenant.settings.edit": "editor.needs.settings",
};

export type FormApi<F> = {
  form: F;
  set: <K extends keyof F>(field: K, value: F[K]) => void;
  errors: Errors;
  /** Why the viewer may not change `field`, or undefined when they may. */
  reason: (field: string) => string | undefined;
};

/**
 * One catalogue row's editor: the panel, who changed it last, Save to draft (checked with the row's schema first,
 * so messages show beside each field) and Remove. `id` null is a new row; the server picks its real id.
 */
export function RowPanel<F extends object>({
  kind,
  id,
  initial,
  toValue,
  removeText,
  children,
  ...p
}: PanelProps & {
  kind: RowKind;
  id: string | null;
  initial: F;
  toValue: (form: F) => { value: Record<string, unknown>; errors: Errors };
  removeText: string;
  children: (api: FormApi<F>) => ReactNode;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = useCallback(<K extends keyof F>(field: K, value: F[K]) => setForm((f) => ({ ...f, [field]: value })), []);
  const reason = (field: string) => {
    const key = fieldKey(ROW_TABLES[kind], field);
    return p.keys.includes(key) ? undefined : t(NEEDS[key] ?? "editor.forbidden");
  };

  const send = (value: unknown) =>
    startTransition(async () => {
      setMessage(null);
      const result = await p.save({ kind, id: id ?? crypto.randomUUID(), value });
      if ("error" in result) return setMessage(t(result.error));
      router.refresh();
      p.onDone(t("editor.saved"));
    });

  const onSave = () => {
    const { value, errors: own } = toValue(form);
    const parsed = ROW_VALUE_SCHEMAS[kind].safeParse(value);
    const all = { ...(parsed.success ? {} : issueErrors(parsed.error.issues)), ...own };
    setErrors(all);
    if (Object.keys(all).length === 0) send(parsed.data);
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      {p.change && (
        <p className="text-sm text-muted">
          {t("editor.lastChange", {
            name: p.change.name,
            time: new Date(p.change.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }),
          })}
        </p>
      )}
      {children({ form, set, errors, reason })}
      {message && (
        <p role="alert" className="font-medium text-red-800">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-muted/40 pt-4">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? t("editor.working") : t("editor.save")}
        </button>
        {id && p.keys.includes("catalogue.edit") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-red-800 px-4 py-2 font-medium text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-60"
            onClick={() => window.confirm(removeText) && send(null)}
          >
            {t("editor.remove")}
          </button>
        )}
      </div>
    </form>
  );
}
