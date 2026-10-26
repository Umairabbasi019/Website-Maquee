"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "@/ui/i18n";

/**
 * The side panel the ✎ buttons open: a modal <dialog>, so the page behind is inert, focus stays inside and Escape
 * closes it. Full screen below 640 px, 420 px wide on the right above. The opener puts focus back on its ✎.
 */
export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    // No close() on cleanup: its async "close" event would end the panel under Strict Mode's double effect run.
    // Removing the element takes it out of the top layer anyway.
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-none overflow-y-auto bg-bg p-0 text-text shadow-xl backdrop:bg-black/50 sm:w-[420px]"
    >
      <div className="flex items-center justify-between gap-4 border-b border-muted/40 p-4">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="rounded-md px-3 py-1 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          {t("editor.close")}
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
