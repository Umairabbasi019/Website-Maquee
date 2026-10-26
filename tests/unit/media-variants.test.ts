import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/access", () => ({}));

const { mediaKeyFrom, objectPath, planVariants, processUpload } = await import("@/modules/media");

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TENANT = "8f14e45f-ceea-467f-a8f3-1c2b3d4e5f60";

const solid = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({ create: { width, height, channels, background: { r: 200, g: 100, b: 50, alpha: 0.5 } } });

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
};

/** A PNG that claims width × height but carries almost no pixel data: the header is all a size check may read. */
function hugePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(100))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("planVariants", () => {
  it("keeps a small photo at its own size", () => {
    expect(planVariants(1000, 750)).toEqual([{ size: "s", width: 1000, height: 750 }]);
  });

  it("adds m only when the photo is longer than the s target", () => {
    expect(planVariants(1600, 900)).toEqual([
      { size: "s", width: 1280, height: 720 },
      { size: "m", width: 1600, height: 900 },
    ]);
  });

  it("makes all three sizes for a large photo", () => {
    expect(planVariants(4000, 3000)).toEqual([
      { size: "s", width: 1280, height: 960 },
      { size: "m", width: 1920, height: 1440 },
      { size: "l", width: 2880, height: 2160 },
    ]);
  });

  it("measures a portrait photo by its height", () => {
    expect(planVariants(3000, 4000)).toEqual([
      { size: "s", width: 960, height: 1280 },
      { size: "m", width: 1440, height: 1920 },
      { size: "l", width: 2160, height: 2880 },
    ]);
  });
});

describe("mediaKeyFrom and objectPath", () => {
  it("makes a safe key from any file name", () => {
    const key = mediaKeyFrom("../../Hall Photo.JPG");
    expect(key).toMatch(KEY_RE);
    expect(key).toMatch(/^hall-photo-[0-9a-f]{6}$/);
    expect(mediaKeyFrom("....")).toMatch(/^photo-[0-9a-f]{6}$/);
    expect(mediaKeyFrom(`${"a".repeat(200)}.jpg`)).toMatch(KEY_RE);
  });

  it("builds <tenant>/<key>/<size>.<ext> and refuses anything else", () => {
    expect(objectPath(TENANT, "hall-photo-abc123", "m", "jpg")).toBe(`${TENANT}/hall-photo-abc123/m.jpg`);
    expect(() => objectPath(TENANT, "../x", "s", "jpg")).toThrow();
    expect(() => objectPath("not-a-uuid", "hall", "s", "jpg")).toThrow();
    expect(() => objectPath(`${TENANT}/..`, "hall", "s", "jpg")).toThrow();
    expect(() => objectPath(TENANT, "hall", "s", "svg")).toThrow();
    expect(() => objectPath(TENANT, "hall", "depth", "jpg")).toThrow();
  });
});

describe("processUpload", () => {
  it("refuses a file that is not an image", async () => {
    expect(await processUpload(Buffer.from("just some text, renamed to .jpg"))).toEqual({ error: "type" });
  });

  it("refuses HEIC", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic\0\0\0\0mif1heic")]);
    expect(await processUpload(heic)).toEqual({ error: "type" });
  });

  it("refuses an image format sharp reads but we do not take", async () => {
    expect(await processUpload(await solid(20, 20).gif().toBuffer())).toEqual({ error: "type" });
  });

  it("refuses a file over 15 MB before decoding", async () => {
    expect(await processUpload(Buffer.alloc(15 * 1024 * 1024 + 1))).toEqual({ error: "tooLarge" });
  });

  it("refuses a 20 000 × 20 000 PNG", async () => {
    expect(await processUpload(hugePng(20_000, 20_000))).toEqual({ error: "tooManyPixels" });
  });

  it("refuses an animated WebP", async () => {
    // Two different frames: the encoder merges identical ones into a still image.
    const frames = await Promise.all([solid(16, 16).png().toBuffer(), solid(16, 16, 4).png().toBuffer()]);
    const animated = await sharp(frames, { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await processUpload(animated)).toEqual({ error: "animated" });
  });

  it("keeps a PNG with transparency as PNG", async () => {
    const result = await processUpload(await solid(40, 30, 4).png().toBuffer());
    if ("error" in result) throw new Error(result.error);
    expect(result.ext).toBe("png");
    expect((await sharp(result.variants[0].data).metadata()).format).toBe("png");
  });

  it("turns other photos into stripped JPEG variants with the planned sizes", async () => {
    const result = await processUpload(await solid(1600, 900).webp().toBuffer());
    if ("error" in result) throw new Error(result.error);
    expect(result.ext).toBe("jpg");
    expect(result.variants.map((v) => [v.size, v.width, v.height])).toEqual([
      ["s", 1280, 720],
      ["m", 1600, 900],
    ]);
    for (const v of result.variants) {
      const meta = await sharp(v.data).metadata();
      expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["jpeg", v.width, v.height, undefined]);
    }
  });

  it("applies EXIF orientation 6 (width and height swap)", async () => {
    const rotated = await solid(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processUpload(rotated);
    if ("error" in result) throw new Error(result.error);
    expect(result.variants).toMatchObject([{ size: "s", width: 100, height: 200 }]);
    const meta = await sharp(result.variants[0].data).metadata();
    expect([meta.width, meta.height, meta.orientation]).toEqual([100, 200, undefined]);
  });
});
