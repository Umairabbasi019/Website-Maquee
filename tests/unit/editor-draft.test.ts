import { describe, expect, it } from "vitest";
import {
  applyChange,
  checkDraft,
  DraftChangeSchema,
  DraftError,
  itemKey,
  mediaUsage,
  sampleReport,
  SiteDraftSchema,
  type SiteDraft,
} from "@/modules/editor";
import { manorCatalogue } from "../../scripts/seed-data/manor";
import { ids, manorDraft, siteDraft } from "./fixtures/site-draft";

const NEW_ID = "00000000-0000-4000-8000-000000000501";
const NEW_ID_2 = "00000000-0000-4000-8000-000000000502";

/** Every media key the draft uses, as a library where each has alt text. */
const libraryFor = (draft: SiteDraft) =>
  Object.fromEntries([...mediaUsage(draft).keys()].map((key) => [key, { alt: `Photo ${key}`, sizes: ["s", "m"] }]));

describe("SiteDraftSchema", () => {
  it("parses the fixture drafts", () => {
    expect(SiteDraftSchema.safeParse(siteDraft()).success).toBe(true);
    expect(SiteDraftSchema.safeParse(manorDraft()).success).toBe(true);
  });
});

describe("applyChange", () => {
  it("edits one package and clears only its sample flag", () => {
    const draft = siteDraft();
    const gold = draft.packages.find((p) => p.id === ids.gold)!;
    const next = applyChange(draft, {
      kind: "package",
      id: ids.gold,
      value: {
        eventTypeId: gold.eventTypeId,
        name: gold.name,
        pricePerGuestPaisa: 450_000,
        minGuests: gold.minGuests,
        items: gold.items,
        featured: gold.featured,
        sort: gold.sort,
      },
    });
    const after = next.packages.find((p) => p.id === ids.gold)!;
    expect(after).toMatchObject({ pricePerGuestPaisa: 450_000, sample: false });
    expect(next.packages.filter((p) => p.id !== ids.gold).every((p) => p.sample)).toBe(true);
    expect(draft.packages.find((p) => p.id === ids.gold)!.pricePerGuestPaisa).toBe(420_000);
  });

  it("removes the default event with its packages and clears defaultEvent", () => {
    const next = applyChange(siteDraft(), { kind: "event", id: ids.barat, value: null });
    expect(next.events.map((e) => e.id)).toEqual([ids.mehndi]);
    expect(next.packages.map((p) => p.id)).toEqual([ids.mehndiGold]);
    expect(next.content.packages.defaultEvent).toBeUndefined();
    expect(SiteDraftSchema.safeParse(next).success).toBe(true);
  });

  it("gives new events a unique slug and keeps the slug on rename", () => {
    const value = { name: "Mehndi Night", description: "", mediaKey: null, sort: 2 };
    const one = applyChange(siteDraft(), { kind: "event", id: NEW_ID, value });
    const two = applyChange(one, { kind: "event", id: NEW_ID_2, value });
    expect(two.events.find((e) => e.id === NEW_ID)).toMatchObject({ slug: "mehndi-night", sample: false });
    expect(two.events.find((e) => e.id === NEW_ID_2)!.slug).toBe("mehndi-night-2");

    const renamed = applyChange(siteDraft(), {
      kind: "event",
      id: ids.barat,
      value: { name: "Baraat Night", description: "The big night.", mediaKey: "demo-room-1", sort: 0 },
    });
    expect(renamed.events.find((e) => e.id === ids.barat)).toMatchObject({ name: "Baraat Night", slug: "barat" });
  });

  it("swaps a media key in every place it is used", () => {
    const draft = siteDraft();
    draft.content.hero.front.key = "old-key";
    draft.content.gallery.tiles[0].key = "old-key";
    draft.theme.logo = "old-key";
    draft.content.seo.image = "old-key";
    draft.events[0].mediaKey = "old-key";
    draft.stageThemes[0].mediaKeys = ["old-key"];
    const next = applyChange(draft, { kind: "swapMedia", from: "old-key", to: "new-key" });
    expect(JSON.stringify(next)).not.toContain("old-key");
    expect([
      next.content.hero.front.key,
      next.content.gallery.tiles[0].key,
      next.theme.logo,
      next.content.seo.image,
      next.events[0].mediaKey,
      next.stageThemes[0].mediaKeys[0],
    ]).toEqual(Array(6).fill("new-key"));
  });

  it("sets an existing settings path, including an optional field that is unset", () => {
    const next = applyChange(siteDraft(), { kind: "settings", part: "content", path: ["contact", "guests", "max"], value: 1200 });
    expect(next.content.contact.guests.max).toBe(1200);
    const noDefault = applyChange(siteDraft(), { kind: "event", id: ids.barat, value: null });
    const withDefault = applyChange(noDefault, { kind: "settings", part: "content", path: ["packages", "defaultEvent"], value: "mehndi" });
    expect(withDefault.content.packages.defaultEvent).toBe("mehndi");
  });

  it("refuses settings paths that are not part of the shape", () => {
    const at = (part: "content" | "sections", path: string[]) => () => applyChange(siteDraft(), { kind: "settings", part, path, value: 1 });
    expect(at("content", ["contact", "nope"])).toThrow(DraftError);
    expect(at("content", ["gallery", "rating", "value"])).toThrow(DraftError);
    expect(at("sections", ["8", "visible"])).toThrow(DraftError);
    expect(at("content", ["constructor"])).toThrow(DraftError);
  });

  it("throws on removing an unknown row", () => {
    expect(() => applyChange(siteDraft(), { kind: "offer", id: NEW_ID, value: null })).toThrow(DraftError);
  });
});

describe("itemKey", () => {
  it("names the row, the settings field (two levels deep) or the media key", () => {
    expect(itemKey({ kind: "package", id: ids.gold, value: null })).toBe(`package:${ids.gold}`);
    expect(itemKey({ kind: "settings", part: "content", path: ["contact", "manager", "name"], value: "Ali" })).toBe(
      "settings:content.contact.manager",
    );
    expect(itemKey({ kind: "settings", part: "identity", path: ["phones"], value: [] })).toBe("settings:identity.phones");
    expect(itemKey({ kind: "swapMedia", from: "a", to: "b" })).toBe("media:a");
  });
});

describe("DraftChangeSchema", () => {
  const offer = { title: "Eid", body: "Eid offer", active: true, sort: 0, discountKind: "percent", discountValue: 10, startsOn: null, endsOn: null };
  it("parses row, settings and swap changes", () => {
    expect(DraftChangeSchema.safeParse({ kind: "offer", id: NEW_ID, value: offer }).success).toBe(true);
    expect(DraftChangeSchema.safeParse({ kind: "addon", id: NEW_ID, value: null }).success).toBe(true);
    expect(DraftChangeSchema.safeParse({ kind: "settings", part: "identity", path: ["phones"], value: [] }).success).toBe(true);
    expect(DraftChangeSchema.safeParse({ kind: "swapMedia", from: "a", to: "b" }).success).toBe(true);
  });
  it("refuses bad paths, ids and offer discounts", () => {
    const bad = [
      { kind: "settings", part: "identity", path: ["__proto__"], value: 1 },
      { kind: "settings", part: "content", path: ["a", "b", "c", "d", "e"], value: 1 },
      { kind: "settings", part: "limits", path: ["loginLimit"], value: 1 },
      { kind: "offer", id: "not-a-uuid", value: null },
      { kind: "offer", id: NEW_ID, value: { ...offer, discountValue: null } },
      { kind: "offer", id: NEW_ID, value: { ...offer, discountValue: 150 } },
      { kind: "offer", id: NEW_ID, value: { ...offer, discountKind: "fixed", discountValue: 0 } },
      { kind: "offer", id: NEW_ID, value: { ...offer, startsOn: "2026-12-01", endsOn: "2026-11-01" } },
      { kind: "addon", id: NEW_ID, value: { name: "Lights", pricePaisa: 0, basis: "flat", active: true, sort: 0 } },
    ];
    for (const change of bad) expect(DraftChangeSchema.safeParse(change).success, JSON.stringify(change)).toBe(false);
  });
});

describe("checkDraft", () => {
  it("finds nothing wrong with the fixture", () => {
    const draft = siteDraft();
    expect(checkDraft(draft, libraryFor(draft))).toEqual([]);
  });

  it("flags packages above the form maximum, missing photos, missing alt text and orphan packages", () => {
    const draft = siteDraft();
    const media = libraryFor(draft);
    draft.packages[0].minGuests = 1200; // contact.guests.max is 1000
    draft.content.gallery.tiles[0].key = "not-uploaded";
    media["demo-stage"].alt = "";
    draft.packages[3].eventTypeId = NEW_ID;
    const issues = checkDraft(draft, media);
    expect(issues).toContainEqual({ item: "Package: Silver (Barat)", code: "minGuestsAboveForm" });
    expect(issues).toContainEqual({ item: "Gallery", code: "missingMedia" });
    expect(issues).toContainEqual({ item: "Stage reveal", code: "missingAlt" });
    expect(issues).toContainEqual({ item: "Stage theme: Royal", code: "missingAlt" });
    expect(issues).toContainEqual({ item: "Package: Gold", code: "packageWithoutEvent" });
    expect(issues).toHaveLength(5);
  });

  it("warns when a depth hero photo has no depth map", () => {
    const draft = siteDraft();
    draft.content.hero.mode = "depth";
    const media = libraryFor(draft);
    media[draft.content.hero.hall.key].sizes.push("depth");
    expect(checkDraft(draft, media)).toEqual([{ item: "Hero front", code: "depthMissing" }]);
  });
});

describe("mediaUsage and sampleReport", () => {
  it("lists where each key is used", () => {
    expect(mediaUsage(siteDraft()).get("demo-room-1")).toContain("Barat background");
    expect(mediaUsage(siteDraft()).get("demo-stage")).toEqual(["Stage reveal", "Stage theme: Royal"]);
  });

  it("counts every sample row of the Manor seed", () => {
    expect(sampleReport(manorDraft())).toEqual({
      events: manorCatalogue.events.length,
      packages: manorCatalogue.events.reduce((n, e) => n + e.packages.length, 0),
      offers: manorCatalogue.offers.length,
      addons: 0,
      stageThemes: 0,
      content: true,
    });
  });
});
