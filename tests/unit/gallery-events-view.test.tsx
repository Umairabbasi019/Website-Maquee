import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteView } from "@/modules/site";
import { SECTION_KEYS } from "@/modules/tenants";
import { Events } from "@/sections/events/Events";
import { Gallery } from "@/sections/gallery/Gallery";
import { EnquiryProvider } from "@/sections/shared/enquiry-state";
import { manorCatalogue, manorContent, manorIdentity, manorMessaging, manorTheme } from "../../scripts/seed-data/manor";
import { defaultSettings } from "./fixtures/tenant-settings";

type Raw = Parameters<typeof buildSiteView>[0];
type Catalogue = Raw["catalogue"];
type Media = Raw["media"];

// Seed prices are rupees; the catalogue holds paisa.
const manor: Catalogue = {
  events: manorCatalogue.events.map(({ packages, ...e }) => ({
    ...e,
    packages: packages.map(({ rupees, featured, ...p }) => ({ ...p, pricePerGuestPaisa: rupees * 100, featured: !!featured })),
  })),
  offers: manorCatalogue.offers,
  hasSample: true,
};

const asset = (key: string): Media[string] => ({ key, alt: `alt ${key}`, urls: { m: `/m/${key}.jpg` }, widths: { m: 2400 }, aspect: 1.5 });
const mediaFor = (keys: string[]): Media => Object.fromEntries(keys.map((k) => [k, asset(k)]));

const view = (over: Partial<Raw> = {}) =>
  buildSiteView({
    tenantId: "t1",
    status: "live",
    identity: { ...defaultSettings.identity, ...manorIdentity },
    theme: manorTheme,
    sections: SECTION_KEYS.map((key) => ({ key, visible: true })),
    moneyRules: defaultSettings.moneyRules,
    messaging: { ...defaultSettings.messaging, ...manorMessaging },
    content: manorContent,
    media: {},
    catalogue: manor,
    slots: ["Lunch", "Dinner"],
    ...over,
  });

const hide = (...hidden: string[]) => SECTION_KEYS.map((key) => ({ key, visible: !hidden.includes(key) }));
const shots = (html: string) => (html.match(/<img /g) ?? []).length;
const decorative = (html: string) => (html.match(/<img [^>]*alt=""[^>]*aria-hidden="true"/g) ?? []).length;

describe("Gallery with missing data", () => {
  const render = (over: Partial<Raw> = {}) => renderToStaticMarkup(<Gallery site={view(over)} />);
  const tiles = manorContent.gallery.tiles;
  const withRating = (rating: typeof manorContent.gallery.rating) => ({ content: { ...manorContent, gallery: { ...manorContent.gallery, rating } } });

  it("shows the rating card only when there is a rating", () => {
    expect(render(withRating(manorContent.gallery.rating))).toContain("829 Google reviews");
    expect(render(withRating(undefined))).not.toContain("Google reviews");
  });

  it("shows the follow link only with an Instagram account and a label", () => {
    expect(render()).toContain("Follow @themanormarquee");
    const noSocial = { identity: { ...defaultSettings.identity, ...manorIdentity, social: {} } };
    expect(render(noSocial)).not.toContain("Follow @themanormarquee");
    const noLabel = { content: { ...manorContent, gallery: { ...manorContent.gallery, followLabel: undefined } } };
    expect(render(noLabel)).not.toContain("instagram.com/themanormarquee");
  });

  it("skips a tile whose media key has no asset", () => {
    const all = render({ media: mediaFor(tiles.map((t) => t.key)) });
    const missing = render({ media: mediaFor(tiles.slice(1).map((t) => t.key)) });
    expect(shots(all)).toBe(tiles.length * 4);
    // Each tile is read out once; its drift copies are decorative.
    expect(shots(all) - decorative(all)).toBe(tiles.length);
    expect(shots(missing)).toBe((tiles.length - 1) * 4);
    expect(missing).not.toContain(`alt ${tiles[0].key}"`);
  });

  it("renders no reel when no tile has an asset", () => {
    const html = render();
    expect(shots(html)).toBe(0);
    expect(html).not.toContain("aria-hidden");
    expect(html).toContain("Real events,");
  });
});

describe("Events with missing data", () => {
  const render = (over: Partial<Raw> = {}) =>
    renderToStaticMarkup(
      <EnquiryProvider guests={400}>
        <Events site={view(over)} />
      </EnquiryProvider>,
    );
  const first = manor.events[0];
  const only = (event: Catalogue["events"][number]): Partial<Raw> => ({ catalogue: { ...manor, events: [event] } });

  it("renders no background for an event without an asset, but keeps its note", () => {
    const html = render({ ...only(first), media: {} });
    expect(shots(html)).toBe(0);
    expect(html).toContain(first.description);
    const withBg = render({ ...only(first), media: mediaFor([first.mediaKey!]) });
    expect(shots(withBg)).toBe(1);
    expect(decorative(withBg)).toBe(1);
  });

  it("renders an event with no packages, without a See packages button", () => {
    const html = render(only({ ...first, packages: [] }));
    expect(html).toContain(first.description);
    expect(html).not.toContain("See packages");
    expect(render(only(first))).toContain("See packages");
  });

  it("drops See packages when Packages is hidden", () => {
    const html = render({ sections: hide("packages") });
    expect(html).not.toContain("See packages");
    expect(html).toContain("Check a Mehndi date");
  });

  it("drops Check a date when Contact is hidden", () => {
    const html = render({ sections: hide("contact") });
    expect(html).not.toContain("Check a");
    expect(html).toContain("See packages");
  });
});
