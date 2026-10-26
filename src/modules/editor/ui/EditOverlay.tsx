"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PermissionKey } from "@/modules/access";
import type { MediaView } from "@/modules/media/client";
import type { EditTarget } from "@/sections/shared/edit";
import { t } from "@/ui/i18n";
import { itemKey } from "../changes";
import type { RowKind, SiteDraft } from "../draft";
import type { DraftChanges } from "../server/draft";
import { visibleTargets } from "../targets";
import type { Upload } from "./fields";
import { Panel } from "./Panel";
import { AddonPanel } from "./panels/AddonPanel";
import { EventPanel } from "./panels/EventPanel";
import { OfferPanel } from "./panels/OfferPanel";
import { PackagePanel } from "./panels/PackagePanel";
import { StageThemePanel } from "./panels/StageThemePanel";
import type { PanelProps, SaveAction } from "./RowPanel";

export type CatalogueDraft = Pick<SiteDraft, "events" | "packages" | "offers" | "addons" | "stageThemes">;

/** A catalogue ✎ target: the row kind, the row id (null for "add"), and for a new package its event. */
type Opened = { kind: RowKind; id: string | null; eventId?: string; title: string };

const KINDS: Record<string, RowKind> = { package: "package", event: "event", offer: "offer", addon: "addon", "stage-theme": "stageTheme" };
const TARGET = /^(package|event|offer|addon|stage-theme)(-new)?(?::(.+))?$/;

// Task 11 adds the venue info, gallery and section panels; until then those targets get no ✎ (no button without a panel).
function parse(target: string, title: string): Opened | null {
  const m = TARGET.exec(target);
  if (!m) return null;
  const kind = KINDS[m[1]];
  if (!m[2]) return m[3] ? { kind, id: m[3], title } : null;
  return { kind, id: null, eventId: m[3], title };
}

type Spot = { host: HTMLElement; target: EditTarget; label: string; isNew: boolean };

const editButton =
  "pointer-events-auto rounded bg-accent px-2 py-0.5 text-xs font-semibold text-bg shadow hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";
const addButton =
  "rounded border border-dashed border-accent px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/** Inactive rows are not on the page, so their ✎ sits beside the section's "Add" button instead. */
function hiddenRows(kind: RowKind, rows: CatalogueDraft): { id: string; label: string }[] {
  if (kind === "offer") return rows.offers.filter((r) => !r.active).map((r) => ({ id: r.id, label: t("edit.offer", { title: r.title }) }));
  if (kind === "addon") return rows.addons.filter((r) => !r.active).map((r) => ({ id: r.id, label: t("edit.addon", { name: r.name }) }));
  if (kind === "stageTheme") return rows.stageThemes.filter((r) => !r.active).map((r) => ({ id: r.id, label: t("edit.stageTheme", { name: r.name }) }));
  return [];
}

const nextSort = (rows: { sort: number }[]) => Math.max(0, ...rows.map((r) => r.sort)) + 10;

/**
 * Puts a ✎ button into every `[data-edit]` element of the canvas the viewer may change (an "Add …" button into
 * placeholders) and opens that item's panel. Hiding a ✎ is UX only: the server checks every save again.
 */
export function EditOverlay({
  keys,
  rows,
  changes,
  media,
  upload,
  save,
}: {
  keys: PermissionKey[];
  rows: CatalogueDraft;
  changes: DraftChanges;
  media: MediaView[];
  upload?: Upload;
  save: SaveAction;
}) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [status, setStatus] = useState("");
  const opener = useRef<HTMLElement | null>(null);

  // Runs again after every refresh (new rows), since a save can add or remove marked elements.
  useEffect(() => {
    const sees = visibleTargets(keys);
    const found: Spot[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-edit]")) {
      const target = el.dataset.edit as EditTarget;
      if (!TARGET.test(target) || !sees(target)) continue;
      const isNew = target.includes("-new");
      let host = el.querySelector<HTMLElement>(":scope > [data-edit-host]");
      if (!host) {
        host = document.createElement("span");
        host.dataset.editHost = "";
        // First child, so the ✎ comes before the item's own links in the tab order.
        el.prepend(host);
      }
      if (!isNew) {
        host.className = "pointer-events-none absolute top-2 right-2 z-50";
        if (getComputedStyle(el).position === "static") el.style.position = "relative";
      } else host.className = "flex flex-wrap gap-2 py-2";
      found.push({ host, target, label: el.dataset.editLabel ?? "", isNew });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the marked elements are server-rendered DOM, readable only after commit.
    setSpots(found);
  }, [keys, rows]);

  const show = (o: Opened | null, e: { currentTarget: HTMLElement }) => {
    opener.current = e.currentTarget;
    setStatus("");
    setOpen(o);
  };
  const close = (message = "") => {
    setOpen(null);
    setStatus(message);
    // The ✎ survives a refresh (same element); a removed item's does not, and focus then stays where the browser puts it.
    if (opener.current?.isConnected) opener.current.focus();
  };

  return (
    <>
      {spots.map((s) =>
        createPortal(
          s.isNew ? (
            <>
              <button type="button" className={addButton} onClick={(e) => show(parse(s.target, s.label), e)}>
                + {s.label}
              </button>
              {hiddenRows(parse(s.target, "")!.kind, rows).map((h) => (
                <button key={h.id} type="button" className={addButton} onClick={(e) => show(parse(`${s.target.replace("-new", "")}:${h.id}`, h.label), e)}>
                  ✎ {t("editor.hidden", { label: h.label })}
                </button>
              ))}
            </>
          ) : (
            <button type="button" aria-label={s.label} className={editButton} onClick={(e) => show(parse(s.target, s.label), e)}>
              ✎ edit
            </button>
          ),
          s.host,
          s.target,
        ),
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
      {open && (
        <Panel title={open.title} onClose={() => close()}>
          <OpenPanel
            opened={open}
            rows={rows}
            media={media}
            upload={upload}
            common={{
              title: open.title,
              keys,
              change: open.id ? changes[itemKey({ kind: open.kind, id: open.id, value: null })] : undefined,
              save,
              onDone: close,
              onClose: () => close(),
            }}
          />
        </Panel>
      )}
    </>
  );
}

function OpenPanel({ opened, rows, media, upload, common }: { opened: Opened; rows: CatalogueDraft; media: MediaView[]; upload?: Upload; common: PanelProps }) {
  const find = <R extends { id: string }>(list: R[]) => list.find((r) => r.id === opened.id);
  switch (opened.kind) {
    case "package": {
      const row = find(rows.packages);
      const eventId = row?.eventTypeId ?? opened.eventId!;
      return <PackagePanel {...common} row={row} eventId={eventId} sort={nextSort(rows.packages.filter((p) => p.eventTypeId === eventId))} />;
    }
    case "event":
      return <EventPanel {...common} row={find(rows.events)} sort={nextSort(rows.events)} media={media} upload={upload} />;
    case "offer":
      return <OfferPanel {...common} row={find(rows.offers)} sort={nextSort(rows.offers)} />;
    case "addon":
      return <AddonPanel {...common} row={find(rows.addons)} sort={nextSort(rows.addons)} />;
    case "stageTheme":
      return <StageThemePanel {...common} row={find(rows.stageThemes)} sort={nextSort(rows.stageThemes)} media={media} upload={upload} />;
  }
}
