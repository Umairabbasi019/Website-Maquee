// Catalogue seed shape. Prices are rupees per guest; the seed script converts to paisa.
export type SeedCatalogue = {
  events: {
    slug: string;
    name: string;
    description: string;
    mediaKey: string;
    // Package order is the sort order; `featured` marks the highlighted one.
    packages: { name: string; rupees: number; minGuests: number; featured?: boolean; items: string[] }[];
  }[];
  offers: { title: string; body: string }[];
};
