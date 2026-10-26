"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import { buttonClass } from "@/ui/form-styles";
import { t } from "@/ui/i18n";
import { applyChange, itemKey } from "../changes";
import { SiteDraftSchema, type SettingsPart, type SiteDraft } from "../draft";
import type { DraftChanges } from "../server/draft";
import { issueErrors, type Errors } from "./fields";
import { LastChange, type PanelProps } from "./RowPanel";

/** One settings value a panel saves: `path` inside `part` (empty for the whole part). */
export type SettingChange = { part: SettingsPart; path: string[]; value: unknown };

/** What every settings panel gets from the overlay. */
export type SettingsProps = Omit<PanelProps, "change"> & { draft: SiteDraft; changes: DraftChanges };

export type SettingsApi<F> = { form: F; set: <K extends keyof F>(field: K, value: F[K]) => void; setForm: (form: F) => void; errors: Errors };

const at = (root: unknown, path: string[]) => path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);

/**
 * A panel over venue settings: who changed them last, and Save to draft, which sends only the values that differ
 * from the draft, one change each. The draft with every change applied is checked with SiteDraftSchema first, so
 * messages show beside each field; error keys are full draft paths ("identity.phones.0").
 */
export function SettingsPanel<F>({
  draft,
  changes,
  save,
  onDone,
  initial,
  toChanges,
  children,
  after,
}: SettingsProps & {
  initial: F;
  toChanges: (form: F) => { changes: SettingChange[]; errors?: Errors };
  children: (api: SettingsApi<F>) => ReactNode;
  /** Rendered below the form, for controls that are forms of their own. */
  after?: (api: SettingsApi<F>) => ReactNode;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = useCallback(<K extends keyof F>(field: K, value: F[K]) => setForm((f) => ({ ...f, [field]: value })), []);
  const api = { form, set, setForm, errors };

  const last = toChanges(initial)
    .changes.map((c) => changes[itemKey({ kind: "settings", ...c })])
    .filter(Boolean)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  const onSave = () => {
    const { changes: all, errors: own = {} } = toChanges(form);
    const todo = all.filter((c) => JSON.stringify(at(draft[c.part], c.path)) !== JSON.stringify(c.value));
    const parsed = SiteDraftSchema.safeParse(todo.reduce((d, c) => applyChange(d, { kind: "settings", ...c }), draft));
    const found = { ...(parsed.success ? {} : issueErrors(parsed.error.issues)), ...own };
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!todo.length) return onDone("");
    startTransition(async () => {
      setMessage(null);
      for (const c of todo) {
        const result = await save({ kind: "settings", ...c });
        if ("error" in result) {
          // Earlier values of this panel may be saved already; the refresh shows what the draft holds now.
          router.refresh();
          return setMessage(t(result.error));
        }
      }
      router.refresh();
      onDone(t("editor.saved"));
    });
  };

  return (
    <>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <LastChange change={last} />
        {children(api)}
        {message && (
          <p role="alert" className="font-medium text-red-800">
            {message}
          </p>
        )}
        <div className="border-t border-muted/40 pt-4">
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? t("editor.working") : t("editor.save")}
          </button>
        </div>
      </form>
      {after?.(api)}
    </>
  );
}
