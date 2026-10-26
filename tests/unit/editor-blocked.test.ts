import { describe, expect, it } from "vitest";
import { ROW_VALUE_SCHEMAS } from "@/modules/catalogue";
import { applyChange, blockedItems, itemKey, type DraftChange, type SiteDraft } from "@/modules/editor";
import { ids, siteDraft } from "./fixtures/site-draft";

const editAll = (draft: SiteDraft, changes: DraftChange[]) => changes.reduce(applyChange, draft);
// Parsing strips the id and sample flag the server sets.
const gold = ROW_VALUE_SCHEMAS.package.parse(siteDraft().packages[1]);
const offer = ROW_VALUE_SCHEMAS.offer.parse(siteDraft().offers[0]);
const newOffer = "00000000-0000-4000-8000-000000000077";

const CHANGES: DraftChange[] = [
  { kind: "package", id: ids.gold, value: { ...gold, pricePerGuestPaisa: 450_000 } },
  { kind: "offer", id: ids.offer, value: { ...offer, title: "Winter saver" } },
  { kind: "offer", id: newOffer, value: { ...offer, discountKind: null, discountValue: null, title: "New" } },
  { kind: "package", id: ids.platinum, value: null },
  { kind: "settings", part: "theme", path: ["colors", "primary"], value: "#000000" },
  { kind: "settings", part: "identity", path: ["phones", "0"], value: "+920000000001" },
  { kind: "swapMedia", from: "demo-room-1", to: "new-photo" },
];

describe("blockedItems", () => {
  it("names only the changed items that need a key the viewer lacks", () => {
    const published = siteDraft();
    published.identity.phones = ["+920000000000"];
    const draft = editAll(published, CHANGES);
    const held = (k: string) => k === "catalogue.edit" || k === "venue.info.edit";
    expect(blockedItems(published, draft, CHANGES.map(itemKey), held)).toEqual([
      "Package: Gold (Barat)",
      "Theme: colors.primary",
      "Inside: Entrance, Barat background",
    ]);
  });

  it("names nothing when every key is held", () => {
    const published = siteDraft();
    expect(blockedItems(published, editAll(published, CHANGES), CHANGES.map(itemKey), () => true)).toEqual([]);
  });
});
