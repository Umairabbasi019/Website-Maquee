import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "8f14e45f-ceea-467f-a8f3-1c2b3d4e5f60";
const calls = vi.hoisted(() => ({
  uploads: [] as { path: string; opts: Record<string, unknown> }[],
  removed: [] as string[][],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
  audits: [] as { action: string }[],
  row: null as Record<string, unknown> | null,
  keys: [] as string[],
}));

vi.mock("@/modules/access", () => {
  class ForbiddenError extends Error {}
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: calls.row, error: null }),
    single: async () => ({ data: { id: "a1b2c3d4-0000-4000-8000-000000000001" }, error: null }),
    insert: (row: Record<string, unknown>) => (calls.inserts.push(row), query),
    update: (row: Record<string, unknown>) => (calls.updates.push(row), { eq: async () => ({ error: null }) }),
    delete: () => (calls.deletes++, { eq: async () => ({ error: null }) }),
  };
  const bucket = {
    upload: async (path: string, _data: unknown, opts: Record<string, unknown>) => (calls.uploads.push({ path, opts }), { error: null }),
    remove: async (paths: string[]) => (calls.removed.push(paths), { error: null }),
  };
  return {
    ForbiddenError,
    can: (_v: unknown, _t: string, key: string) => calls.keys.includes(key),
    requirePerm: async (_t: string, key: string) => {
      if (!calls.keys.includes(key)) throw new ForbiddenError();
      return {};
    },
    createServiceClient: () => ({ from: () => query, storage: { from: () => bucket } }),
    recordAudit: async (a: { action: string }) => void calls.audits.push(a),
  };
});

const { deleteMedia, uploadDepth, uploadMedia } = await import("@/modules/media");

const jpegFile = async (name: string, width: number, height: number) =>
  new File([new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#884422" } }).jpeg().toBuffer())], name);

beforeEach(() => {
  Object.assign(calls, { uploads: [], removed: [], inserts: [], updates: [], deletes: 0, audits: [], row: null, keys: ["media.manage"] });
});

describe("uploadMedia", () => {
  it("writes every size under <tenant>/<new key>/ with a year of caching, then the row and the audit", async () => {
    const result = await uploadMedia(TENANT, await jpegFile("../Stage Night.jpg", 1800, 900), { alt: " Stage at night ", category: "gallery" });
    if (!("key" in result)) throw new Error(result.error);
    expect(result.key).toMatch(/^stage-night-[0-9a-f]{6}$/);
    expect(calls.uploads.map((u) => u.path)).toEqual([`${TENANT}/${result.key}/s.jpg`, `${TENANT}/${result.key}/m.jpg`]);
    expect(calls.uploads[0].opts).toMatchObject({ contentType: "image/jpeg", cacheControl: "31536000" });
    expect(calls.inserts[0]).toMatchObject({
      tenant_id: TENANT,
      alt: "Stage at night",
      sizes: ["s", "m"],
      dims: { s: [1280, 640], m: [1800, 900] },
      ext: "jpg",
    });
    expect(calls.audits.map((a) => a.action)).toEqual(["media.upload"]);
  });

  it("keeps hero, logo and search photos for tenant.settings.edit", async () => {
    await expect(uploadMedia(TENANT, await jpegFile("a.jpg", 10, 10), { alt: "x", category: "hero" })).rejects.toThrow();
    expect(calls.uploads).toEqual([]);
  });

  it("refuses missing alt text and unknown categories before reading the file", async () => {
    const file = await jpegFile("a.jpg", 10, 10);
    expect(await uploadMedia(TENANT, file, { alt: "  ", category: "gallery" })).toEqual({ error: "alt" });
    expect(await uploadMedia(TENANT, file, { alt: "x", category: "../secret" })).toEqual({ error: "category" });
    expect(calls.uploads).toEqual([]);
  });
});

describe("deleteMedia", () => {
  it("refuses a photo in use and touches nothing", async () => {
    calls.row = { id: "r1", key: "g3", alt: "a", category: "room", sizes: ["s"], ext: "jpg", dims: {} };
    expect(await deleteMedia(TENANT, "g3", ["Barat background"])).toEqual({ error: "inUse", usedIn: ["Barat background"] });
    expect([calls.deletes, calls.removed.length]).toEqual([0, 0]);
  });

  it("removes the row and every file, the depth map as png", async () => {
    calls.row = { id: "r1", key: "g3", alt: "a", category: "room", sizes: ["s", "m", "depth"], ext: "jpg", dims: {} };
    expect(await deleteMedia(TENANT, "g3", [])).toEqual({ ok: true });
    expect(calls.deletes).toBe(1);
    expect(calls.removed).toEqual([[`${TENANT}/g3/s.jpg`, `${TENANT}/g3/m.jpg`, `${TENANT}/g3/depth.png`]]);
  });
});

describe("uploadDepth", () => {
  const png = async (width: number, height: number) =>
    new File([new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#808080" } }).png().toBuffer())], "d.png");
  beforeEach(() => {
    calls.keys = ["media.manage", "tenant.settings.edit"];
    calls.row = { id: "r1", key: "wide", alt: "a", category: "hero", sizes: ["s", "m"], ext: "jpg", dims: { s: [1280, 720], m: [1920, 1080] } };
  });

  it("needs tenant.settings.edit", async () => {
    calls.keys = ["media.manage"];
    await expect(uploadDepth(TENANT, "wide", await png(160, 90))).rejects.toThrow();
  });

  it("refuses a map whose shape differs from the photo by more than 1 %", async () => {
    expect(await uploadDepth(TENANT, "wide", await png(160, 100))).toEqual({ error: "aspect" });
    expect(calls.uploads).toEqual([]);
  });

  it("refuses a JPEG depth map", async () => {
    expect(await uploadDepth(TENANT, "wide", await jpegFile("d.jpg", 160, 90))).toEqual({ error: "type" });
  });

  it("stores depth.png and adds depth to sizes and dims", async () => {
    expect(await uploadDepth(TENANT, "wide", await png(320, 180))).toEqual({ ok: true });
    expect(calls.uploads.map((u) => u.path)).toEqual([`${TENANT}/wide/depth.png`]);
    expect(calls.updates[0]).toEqual({ sizes: ["s", "m", "depth"], dims: { s: [1280, 720], m: [1920, 1080], depth: [320, 180] } });
    expect(calls.audits.map((a) => a.action)).toEqual(["media.depth"]);
  });
});

describe("MediaPicker", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { MediaPicker } = await import("@/modules/media");
  const assets = [{ key: "g3", alt: "Floral entrance", urls: { s: "https://x/g3/s.jpg" }, widths: {} }];
  const render = (upload?: Parameters<typeof MediaPicker>[0]["upload"]) =>
    renderToStaticMarkup(createElement(MediaPicker, { assets, onPick: () => {}, upload }));

  it("lists the given photos with their alt text", () => {
    const html = render();
    expect(html).toContain('data-key="g3"');
    expect(html).toContain("Floral entrance");
    expect(html).not.toContain("Upload new");
  });

  it("offers Upload new only when given an upload action", () => {
    expect(render({ action: async () => null, categories: ["gallery"] })).toContain("Upload new");
  });
});
