import { describe, expect, it, vi } from "vitest";

const rows = [
  { key: "ok", alt: "a", sizes: ["s", "m"], ext: "jpg", dims: { s: [800, 400], m: [1600, 800] } },
  { key: "zero-h", alt: "a", sizes: ["s", "m"], ext: "jpg", dims: { s: [800, 0], m: [1600, 800] } },
  { key: "seeded", alt: "a", sizes: ["s", "depth"], ext: "jpg", dims: { s: [800, 400], depth: [800, 400] } },
  { key: "redone", alt: "a", sizes: ["s", "depth"], ext: "jpg", dims: { s: [800, 400], depth: [800, 400], depthVersion: 1730000000000 } },
  { key: "junk", alt: "a", sizes: ["s", "m", "l"], ext: "jpg", dims: { s: "800x400", m: [1600], l: [null, 2] } },
];

vi.mock("@/modules/access", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }),
}));

const { getPublicMedia } = await import("@/modules/media");

describe("getPublicMedia dims", () => {
  it("uses only positive [w, h] pairs for widths and aspect", async () => {
    const media = await getPublicMedia("t1");
    expect(media.ok).toMatchObject({ widths: { s: 800, m: 1600 }, aspect: 2 });
    expect(media["zero-h"]).toMatchObject({ widths: { m: 1600 }, aspect: 2 });
    expect(media.junk.widths).toEqual({});
    expect(media.junk.aspect).toBeUndefined();
    expect(Object.keys(media.junk.urls)).toEqual(["s", "m", "l"]);
  });
});

describe("getPublicMedia depth maps", () => {
  it("adds the upload version to the depth URL, so a corrected map is not served from cache", async () => {
    const media = await getPublicMedia("t1");
    expect(media.seeded.depthUrl).toMatch(/\/seeded\/depth\.png$/);
    expect(media.redone.depthUrl).toMatch(/\/redone\/depth\.png\?v=1730000000000$/);
    expect(media.ok.depthUrl).toBeUndefined();
  });
});
