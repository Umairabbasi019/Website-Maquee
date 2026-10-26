"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { buttonClass } from "@/ui/form-styles";
import { t, type TranslationKey } from "@/ui/i18n";
import type { sampleReport } from "../check";
import type { ActionResult } from "./RowPanel";

type Revisioned = (revision: number) => Promise<ActionResult>;
type Outcome = { ok: string } | { error: string; items: string[] };

const SAMPLE_LABELS: Record<Exclude<keyof ReturnType<typeof sampleReport>, "content">, TranslationKey> = {
  packages: "editor.sample.packages",
  offers: "editor.sample.offers",
  events: "editor.sample.events",
  addons: "editor.sample.addons",
  stageThemes: "editor.sample.stageThemes",
};

const PHONE_WIDTH = 375;

const toggleClass =
  "rounded-md px-3 py-1.5 text-sm font-medium aria-pressed:bg-text aria-pressed:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/**
 * The bar above the draft: unpublished change count, what is still sample, Laptop/Phone width, Discard and Publish.
 * Publish and Discard send the revision this page was rendered with, so a draft changed since is never applied blind.
 * `children` is the laptop canvas; Phone swaps it for the draft at 375 px in a frame.
 */
export function EditorBar({
  revision,
  changeCount,
  sample,
  publish,
  discard,
  children,
}: {
  revision: number | null;
  changeCount: number;
  sample: ReturnType<typeof sampleReport>;
  publish: Revisioned;
  discard: Revisioned;
  children: ReactNode;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  const stillSample = [
    ...(Object.keys(SAMPLE_LABELS) as (keyof typeof SAMPLE_LABELS)[]).filter((k) => sample[k] > 0).map((k) => t(SAMPLE_LABELS[k], { count: sample[k] })),
    ...(sample.content ? [t("editor.sample.content")] : []),
  ];

  const run = (action: Revisioned, done: TranslationKey) =>
    startTransition(async () => {
      setOutcome(null);
      const result = await action(revision!);
      if ("error" in result) {
        const blockedWithoutNames = result.error === "editor.blocked" && !result.items?.length;
        setOutcome({ error: t(result.error), items: blockedWithoutNames ? [t("editor.blockedOther")] : (result.items ?? []) });
      } else setOutcome({ ok: t(done) });
      router.refresh();
    });

  return (
    <>
      <section aria-label={t("editor.bar")} className="z-[60] mb-4 space-y-2 sm:sticky sm:top-0 rounded-lg border border-muted/40 bg-bg p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-medium">
            {changeCount === 0 ? t("editor.changes.none") : changeCount === 1 ? t("editor.changes.one") : t("editor.changes.many", { count: changeCount })}
          </p>
          {stillSample.length > 0 && <p className="text-sm text-muted">{t("editor.sample", { items: stillSample.join(", ") })}</p>}
          <div role="group" aria-label={t("editor.view")} className="flex gap-1 rounded-md border border-muted/40 p-0.5">
            <button type="button" className={toggleClass} aria-pressed={!phone} onClick={() => setPhone(false)}>
              {t("editor.view.laptop")}
            </button>
            <button type="button" className={toggleClass} aria-pressed={phone} onClick={() => setPhone(true)}>
              {t("editor.view.phone")}
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={pending || revision === null}
              className="rounded-md border border-muted px-4 py-2 font-medium hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-60"
              onClick={() => window.confirm(t("editor.discardConfirm")) && run(discard, "editor.discarded")}
            >
              {t("editor.discard")}
            </button>
            <button type="button" disabled={pending || revision === null} className={buttonClass} onClick={() => run(publish, "editor.published")}>
              {pending ? t("editor.working") : t("editor.publish")}
            </button>
          </div>
        </div>
        {outcome && "ok" in outcome && <p role="status">{outcome.ok}</p>}
        {outcome && "error" in outcome && (
          <div role="alert" className="font-medium text-red-800">
            <p>{outcome.error}</p>
            {outcome.items.length > 0 && (
              <ul className="list-disc pl-6 font-normal">
                {outcome.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {phone ? (
        // Keyed by revision: a new draft reloads the preview.
        <iframe key={revision} src="/site-preview" title={t("editor.previewTitle")} width={PHONE_WIDTH} className="mx-auto block h-[80vh] max-w-full rounded-lg border border-muted/40" />
      ) : (
        children
      )}
    </>
  );
}
