import type { SiteDraft } from "./draft";
import { mediaRefs } from "./media-usage";

/** `depthMissing` is a warning; every other code blocks Publish. */
export type DraftIssue = {
  item: string;
  code: "minGuestsAboveForm" | "missingMedia" | "missingAlt" | "packageWithoutEvent" | "depthMissing";
};

/** Problems a draft has against the venue's media library (key → alt text and stored sizes). */
export function checkDraft(draft: SiteDraft, media: Record<string, { alt: string; sizes: string[] }>): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (issue: DraftIssue) => {
    if (!issues.some((i) => i.item === issue.item && i.code === issue.code)) issues.push(issue);
  };

  const events = new Map(draft.events.map((e) => [e.id, e.name]));
  const maxGuests = draft.content.contact.guests.max;
  for (const p of draft.packages) {
    const event = events.get(p.eventTypeId);
    const item = event ? `Package: ${p.name} (${event})` : `Package: ${p.name}`;
    if (!event) add({ item, code: "packageWithoutEvent" });
    // The enquiry form could never pick a guest count this package accepts.
    if (p.minGuests > maxGuests) add({ item, code: "minGuestsAboveForm" });
  }

  for (const { label, key } of mediaRefs(draft)) {
    const asset = Object.hasOwn(media, key) ? media[key] : undefined;
    if (!asset) add({ item: label, code: "missingMedia" });
    else if (!asset.alt.trim()) add({ item: label, code: "missingAlt" });
  }

  const hero = draft.content.hero;
  if (hero.mode === "depth") {
    for (const [item, ref] of [["Hero front", hero.front], ["Hero hall", hero.hall]] as const) {
      if (Object.hasOwn(media, ref.key) && !media[ref.key].sizes.includes("depth")) add({ item, code: "depthMissing" });
    }
  }

  return issues;
}

/** How much of the draft is still sample data. */
export function sampleReport(draft: SiteDraft) {
  const count = (rows: { sample: boolean }[]) => rows.filter((r) => r.sample).length;
  return {
    packages: count(draft.packages),
    offers: count(draft.offers),
    events: count(draft.events),
    addons: count(draft.addons),
    stageThemes: count(draft.stageThemes),
    content: draft.content.sample,
  };
}
