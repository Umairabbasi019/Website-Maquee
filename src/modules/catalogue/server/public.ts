import "server-only";
import { createServiceClient } from "@/modules/access";

export type PublicCatalogue = {
  events: {
    slug: string;
    name: string;
    description: string;
    mediaKey: string | null;
    packages: { name: string; pricePerGuestPaisa: number; minGuests: number; items: string[]; featured: boolean }[];
  }[];
  offers: { title: string; body: string }[];
  hasSample: boolean;
};

// Throws on error; the return type drops the failure variant, so callers see non-null data.
function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** Public catalogue for one tenant. Service client bypasses RLS, so every query is filtered by tenantId. */
export async function getPublicCatalogue(tenantId: string): Promise<PublicCatalogue> {
  const db = createServiceClient();
  const [events, packages, offers] = await Promise.all([
    db.from("event_types").select("id, slug, name, description, media_key, sample").eq("tenant_id", tenantId).order("sort"),
    db
      .from("packages")
      .select("event_type_id, name, price_per_guest_paisa, min_guests, items, featured, sample")
      .eq("tenant_id", tenantId)
      .order("sort"),
    db.from("offers").select("title, body, sample").eq("tenant_id", tenantId).eq("active", true).order("sort"),
  ]);
  const eventRows = check(events, "event_types");
  const packageRows = check(packages, "packages");
  const offerRows = check(offers, "offers");

  return {
    events: eventRows.map((e) => ({
      slug: e.slug,
      name: e.name,
      description: e.description,
      mediaKey: e.media_key,
      packages: packageRows
        .filter((p) => p.event_type_id === e.id)
        .map((p) => ({
          name: p.name,
          pricePerGuestPaisa: p.price_per_guest_paisa,
          minGuests: p.min_guests,
          items: p.items,
          featured: p.featured,
        })),
    })),
    offers: offerRows.map((o) => ({ title: o.title, body: o.body })),
    hasSample: [...eventRows, ...packageRows, ...offerRows].some((r) => r.sample),
  };
}
