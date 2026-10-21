import { describe, expect, it } from "vitest";
import { isPlatformHost, normalizeHost } from "@/modules/tenants";

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

describe("isPlatformHost", () => {
  it("matches only PLATFORM_HOST, ignoring port and case", () => {
    process.env.PLATFORM_HOST = "localhost:3000";
    expect(isPlatformHost("LOCALHOST:3000")).toBe(true);
    expect(isPlatformHost("localhost")).toBe(true);
    expect(isPlatformHost("manor.localhost:3000")).toBe(false);
    expect(isPlatformHost("evil-localhost")).toBe(false);
    expect(isPlatformHost("")).toBe(false);
  });

  it("is false when PLATFORM_HOST is not set", () => {
    const saved = process.env.PLATFORM_HOST;
    delete process.env.PLATFORM_HOST;
    try {
      expect(isPlatformHost("")).toBe(false);
      expect(isPlatformHost("localhost")).toBe(false);
    } finally {
      process.env.PLATFORM_HOST = saved;
    }
  });
});
