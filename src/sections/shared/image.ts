export type ImageSize = "s" | "m" | "l";

const ORDER: ImageSize[] = ["s", "m", "l"];

function idealSize(longSide: number, dpr: number): ImageSize {
  const px = longSide * Math.min(dpr, 3);
  return px <= 1400 ? "s" : px <= 2200 ? "m" : "l";
}

/** Ideal size for the pixels needed, else the nearest size the asset has (larger wins a tie). */
export function pickImageSize(longSide: number, dpr: number, sizes: ImageSize[]): ImageSize {
  const want = ORDER.indexOf(idealSize(longSide, dpr));
  const rank = (s: ImageSize) => Math.abs(ORDER.indexOf(s) - want) * 2 - (ORDER.indexOf(s) > want ? 1 : 0);
  return [...sizes].sort((a, b) => rank(a) - rank(b))[0];
}
