import { describe, expect, it, vi } from "vitest";
import { shouldUseDepth } from "@/sections/hero/depth/shouldUseDepth";

const able = { webgl2: () => true, reducedMotion: false, cores: 8, saveData: false, finePointer: true };

describe("shouldUseDepth", () => {
  it("is on for a capable device", () => {
    expect(shouldUseDepth(able)).toBe(true);
  });
  it.each([{ webgl2: () => false }, { reducedMotion: true }, { cores: 2 }, { saveData: true }, { finePointer: false }])("is off with %o", (change) => {
    expect(shouldUseDepth({ ...able, ...change })).toBe(false);
  });
  it("does not probe WebGL when another check already failed", () => {
    const webgl2 = vi.fn(() => true);
    shouldUseDepth({ ...able, cores: 2, webgl2 });
    expect(webgl2).not.toHaveBeenCalled();
  });
});
