import type { SiteDraft } from "@/modules/editor";
import { manorCatalogue, manorContent, manorIdentity, manorMessaging, manorTheme } from "../../../scripts/seed-data/manor";
import { defaultSettings } from "./tenant-settings";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  barat: id(1),
  mehndi: id(2),
  silver: id(11),
  gold: id(12),
  platinum: id(13),
  mehndiGold: id(14),
  offer: id(21),
  addon: id(31),
  royal: id(41),
};

const pkg = (pkgId: string, eventTypeId: string, name: string, rupees: number, sort: number) => ({
  id: pkgId,
  eventTypeId,
  name,
  pricePerGuestPaisa: rupees * 100,
  minGuests: 300,
  items: ["Chicken Qorma, Biryani", "Kheer"],
  featured: false,
  sort,
  sample: true,
});

/** Demo settings plus a small sample catalogue; Barat is the default event and has three packages. A fresh copy per call. */
export function siteDraft(): SiteDraft {
  const { identity, theme, sections, messaging, content } = structuredClone(defaultSettings);
  return {
    identity: { ...identity, address: "Sample address", openingHours: [{ day: 0, open: "11:00", close: "21:30" }] },
    theme,
    sections,
    messaging: { ...messaging, whatsappNumber: "920000000000" },
    content: { ...content, packages: { ...content.packages, defaultEvent: "barat" } },
    events: [
      { id: ids.barat, slug: "barat", name: "Barat", description: "The big night.", mediaKey: "demo-room-1", sort: 0, sample: true },
      { id: ids.mehndi, slug: "mehndi", name: "Mehndi", description: "Colour and music.", mediaKey: "demo-room-2", sort: 1, sample: true },
    ],
    packages: [
      pkg(ids.silver, ids.barat, "Silver", 3200, 0),
      pkg(ids.gold, ids.barat, "Gold", 4200, 1),
      pkg(ids.platinum, ids.barat, "Platinum", 5200, 2),
      pkg(ids.mehndiGold, ids.mehndi, "Gold", 3400, 0),
    ],
    offers: [
      {
        id: ids.offer,
        title: "Weekday saver",
        body: "10% off Monday to Thursday",
        active: true,
        sort: 0,
        sample: true,
        discountKind: "percent",
        discountValue: 10,
        startsOn: "2026-11-01",
        endsOn: "2026-12-31",
      },
    ],
    addons: [{ id: ids.addon, name: "Fireworks", pricePaisa: 2_500_000, basis: "flat", active: true, sort: 0, sample: true }],
    stageThemes: [
      { id: ids.royal, name: "Royal", description: "Velvet and gold.", pricePaisa: 15_000_000, mediaKeys: ["demo-stage"], active: true, sort: 0, sample: true },
    ],
  };
}

/** The Manor as seeded by scripts/seed-site.ts: every catalogue row is sample data. */
export function manorDraft(): SiteDraft {
  let n = 100;
  const events: SiteDraft["events"] = [];
  const packages: SiteDraft["packages"] = [];
  manorCatalogue.events.forEach((e, sort) => {
    const eventTypeId = id(n++);
    events.push({ id: eventTypeId, slug: e.slug, name: e.name, description: e.description, mediaKey: e.mediaKey, sort, sample: true });
    e.packages.forEach((p, ps) =>
      packages.push({
        id: id(n++),
        eventTypeId,
        name: p.name,
        pricePerGuestPaisa: p.rupees * 100,
        minGuests: p.minGuests,
        items: p.items,
        featured: p.featured ?? false,
        sort: ps,
        sample: true,
      }),
    );
  });
  return {
    identity: { ...defaultSettings.identity, ...manorIdentity },
    theme: manorTheme,
    sections: defaultSettings.sections,
    messaging: { ...defaultSettings.messaging, ...manorMessaging },
    content: manorContent,
    events,
    packages,
    offers: manorCatalogue.offers.map((o, sort) => ({
      id: id(n++),
      ...o,
      active: true,
      sort,
      sample: true,
      discountKind: null,
      discountValue: null,
      startsOn: null,
      endsOn: null,
    })),
    addons: [],
    stageThemes: [],
  };
}
