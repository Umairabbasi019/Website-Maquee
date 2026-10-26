import type { AddonRow, EventTypeRow, OfferRow, PackageRow, StageThemeRow } from "./schemas";

export type PublicCatalogue = {
  events: {
    id: string;
    slug: string;
    name: string;
    description: string;
    mediaKey: string | null;
    packages: { id: string; name: string; pricePerGuestPaisa: number; minGuests: number; items: string[]; featured: boolean }[];
  }[];
  offers: { id: string; title: string; body: string }[];
  addons: { id: string; name: string; pricePaisa: number; basis: AddonRow["basis"] }[];
  stageThemes: { id: string; name: string; description: string; pricePaisa: number; mediaKeys: string[] }[];
  hasSample: boolean;
};

export type CatalogueRows = {
  events: EventTypeRow[];
  packages: PackageRow[];
  offers: OfferRow[];
  addons: AddonRow[];
  stageThemes: StageThemeRow[];
};

const bySort = <T extends { sort: number }>(rows: T[]) => rows.toSorted((a, b) => a.sort - b.sort);
const activeBySort = <T extends { sort: number; active: boolean }>(rows: T[]) => bySort(rows.filter((r) => r.active));

/** What visitors see: active rows only, in sort order. Pure, so the editor can build the same view from a draft. */
export function toPublicCatalogue(rows: CatalogueRows): PublicCatalogue {
  const packages = bySort(rows.packages);
  const offers = activeBySort(rows.offers);
  const addons = activeBySort(rows.addons);
  const stageThemes = activeBySort(rows.stageThemes);
  return {
    events: bySort(rows.events).map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description,
      mediaKey: e.mediaKey,
      packages: packages
        .filter((p) => p.eventTypeId === e.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          pricePerGuestPaisa: p.pricePerGuestPaisa,
          minGuests: p.minGuests,
          items: p.items,
          featured: p.featured,
        })),
    })),
    offers: offers.map((o) => ({ id: o.id, title: o.title, body: o.body })),
    addons: addons.map((a) => ({ id: a.id, name: a.name, pricePaisa: a.pricePaisa, basis: a.basis })),
    stageThemes: stageThemes.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      pricePaisa: s.pricePaisa,
      mediaKeys: s.mediaKeys,
    })),
    hasSample: [...rows.events, ...rows.packages, ...offers, ...addons, ...stageThemes].some((r) => r.sample),
  };
}
