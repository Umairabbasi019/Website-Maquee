import { describe, expect, it } from "vitest";
import { normalizeHost } from "@/modules/tenants";

describe("normalizeHost", () => {
  it.each([
    ["Manor.PK", "manor.pk"],
    ["manor.pk.", "manor.pk"],
    ["manor.pk:3000", "manor.pk"],
    ["www.manor.pk", "manor.pk"],
    ["  WWW.Manor.PK.:443 ", "manor.pk"],
  ])("%s -> %s", (raw, want) => {
    expect(normalizeHost(raw)).toBe(want);
  });
});
