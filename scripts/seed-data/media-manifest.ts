// Media seeded for each venue. A Manor key is also the processed file stem in MANOR_MEDIA_DIR (e-<key>[-s|-l].jpg),
// plus e-<key>-depth.png where tools/depth.py made a depth map for the hero's depth layer.
// source/licence come from references/venue/manifest.csv where the stem has a row there.
export type SeedMedia = {
  key: string;
  alt: string;
  category: "hero" | "room" | "stage" | "gallery" | "event" | "logo" | "seo";
  source: string;
  ext?: "jpg" | "png";
};

export const LICENCE = "owner-approved 2026-10-18";
const SITE = "themanormarquee.com (owner-approved 2026-10-18)";
const OWNER = "owner-provided (Instagram/website), owner-approved 2026-10-18";

export const manorMedia: SeedMedia[] = [
  { key: "ext-night", category: "hero", source: OWNER, alt: "The Manor Marquee glass facade glowing violet at night" },
  { key: "wide", category: "hero", source: `${SITE}, themanor-wide.webp`, alt: "Wide view of the main hall with lit tables and a crystal ceiling" },
  { key: "g3", category: "room", source: `${SITE}, the-manor-gallery-3.webp`, alt: "Floral entrance welcoming guests into the venue" },
  { key: "g7", category: "room", source: `${SITE}, the-manor-gallery-7.webp`, alt: "Grand hall under a ceiling of hanging crystal lights" },
  { key: "lounge", category: "room", source: OWNER, alt: "Lounge with seating for families" },
  { key: "stage", category: "stage", source: OWNER, alt: "Wedding stage with a Mughal arch and chandelier" },
  { key: "dining", category: "room", source: OWNER, alt: "Round dining tables set for a wedding dinner" },
  { key: "hall-floral", category: "event", source: OWNER, alt: "Hall decorated with marigold flowers for a mehndi" },
  { key: "stage-floral", category: "event", source: OWNER, alt: "Stage covered in fresh flowers" },
  { key: "g4", category: "event", source: `${SITE}, the-manor-gallery-4.webp`, alt: "Nikkah ceremony setting with soft lighting" },
  { key: "candles", category: "event", source: OWNER, alt: "Candles lining a decorated walkway" },
  { key: "chandelier", category: "gallery", source: `${SITE}, themanor-chandelier.jpg`, alt: "Large crystal chandelier lit above the hall" },
  { key: "ig-mehndi", category: "gallery", source: OWNER, alt: "Mehndi night with colourful decor and guests" },
  { key: "ig-redstage", category: "gallery", source: OWNER, alt: "Stage dressed in red and gold" },
  { key: "w-curtain", category: "gallery", source: OWNER, alt: "Wedding stage framed by a draped curtain" },
  { key: "w-hall", category: "gallery", source: OWNER, alt: "Wedding hall full of guests at round tables" },
  { key: "w-redcarpet", category: "gallery", source: OWNER, alt: "Red carpet leading to the wedding stage" },
  { key: "v-wreath", category: "gallery", source: OWNER, alt: "Valima entrance with a floral wreath" },
  { key: "v-aisle", category: "gallery", source: OWNER, alt: "Valima aisle lined with flowers" },
  { key: "logo", category: "logo", source: `${SITE}, the-manor.png`, alt: "The Manor Marquee logo", ext: "png" },
];

export const demoMedia: Omit<SeedMedia, "source">[] = [
  { key: "demo-front", category: "hero", alt: "Sample front view of a marquee" },
  { key: "demo-hall", category: "hero", alt: "Sample view of a banquet hall" },
  { key: "demo-room-1", category: "room", alt: "Sample entrance" },
  { key: "demo-room-2", category: "room", alt: "Sample main hall" },
  { key: "demo-room-3", category: "room", alt: "Sample lounge" },
  { key: "demo-stage", category: "stage", alt: "Sample stage" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `demo-tile-${n}`, category: "gallery" as const, alt: `Sample gallery picture ${n}` })),
];
