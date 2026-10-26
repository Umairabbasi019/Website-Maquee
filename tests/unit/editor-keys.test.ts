import { describe, expect, it } from "vitest";
import { requiredKeys, type SiteDraft } from "@/modules/editor";
import { FIELD_PERMISSIONS, type FieldPermission } from "../fixtures/field-permissions";
import { ids, siteDraft } from "./fixtures/site-draft";

// Wrapping the old value always makes a different one, whatever its type.
const changed = (v: unknown) => ["changed", v];

/** Changes only `row.field` in the draft; catalogue fields are changed on the part's first row. */
function changeField(draft: SiteDraft, row: FieldPermission) {
  const part = draft[row.part] as unknown[];
  let holder = (row.column ? part[0] : part) as Record<string, unknown>;
  const path = row.field.split(".");
  const last = path.pop()!;
  for (const seg of path) holder = holder[seg] as Record<string, unknown>;
  holder[last] = changed(holder[last]);
}

describe("requiredKeys", () => {
  it.each(FIELD_PERMISSIONS)("a change to $part $field needs exactly $key", (row) => {
    const after = siteDraft();
    changeField(after, row);
    expect([...requiredKeys(siteDraft(), after)]).toEqual([row.key]);
  });

  it("needs nothing when nothing changed", () => {
    expect(requiredKeys(siteDraft(), siteDraft()).size).toBe(0);
  });

  it("needs both keys for a phone and a theme change", () => {
    const after = siteDraft();
    after.identity.phones = ["+920000000001"];
    after.theme.colors.primary = "#000000";
    expect(requiredKeys(siteDraft(), after)).toEqual(new Set(["venue.info.edit", "tenant.settings.edit"]));
  });

  it("needs the row key plus the price key for a new priced row, and the row key to remove one", () => {
    const before = siteDraft();
    const added = siteDraft();
    added.packages.push({ ...added.packages[0], id: "00000000-0000-4000-8000-000000000099" });
    expect(requiredKeys(before, added)).toEqual(new Set(["catalogue.edit", "prices.edit"]));

    const noDiscount = siteDraft();
    noDiscount.offers.push({ ...noDiscount.offers[0], id: "00000000-0000-4000-8000-000000000098", discountKind: null, discountValue: null });
    expect(requiredKeys(before, noDiscount)).toEqual(new Set(["catalogue.edit"]));

    const removed = siteDraft();
    removed.offers = removed.offers.filter((o) => o.id !== ids.offer);
    expect(requiredKeys(before, removed)).toEqual(new Set(["catalogue.edit"]));
  });
});
