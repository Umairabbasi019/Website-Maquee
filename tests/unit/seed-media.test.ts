import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { imageDims } from "../../scripts/seed-media";

describe("imageDims", () => {
  it("reads a JPEG's size from its frame header", () => {
    expect(imageDims(readFileSync("scripts/seed-data/demo-media/demo-tile-3-s.jpg"))).toEqual([858, 1280]);
  });
  it("reads a PNG's size from IHDR", () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageDims(png)).toEqual([640, 480]);
  });
  it("rejects other files", () => {
    expect(() => imageDims(Buffer.from("GIF89a and then some bytes"))).toThrow();
  });
});
