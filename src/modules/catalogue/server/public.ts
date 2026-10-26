import "server-only";
import { createServiceClient } from "@/modules/access";
import { toPublicCatalogue, type PublicCatalogue } from "../public-view";

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
  const [events, packages, offers, addons, themes] = await Promise.all([
    db.from("event_types").select("id, slug, name, description, media_key, sort, sample").eq("tenant_id", tenantId),
    db.from("packages").select("id, event_type_id, name, price_per_guest_paisa, min_guests, items, featured, sort, sample").eq("tenant_id", tenantId),
    db
      .from("offers")
      .select("id, title, body, active, sort, sample, discount_kind, discount_value, starts_on, ends_on")
      .eq("tenant_id", tenantId),
    db.from("addons").select("id, name, price_paisa, basis, active, sort, sample").eq("tenant_id", tenantId),
    db.from("stage_themes").select("id, name, description, price_paisa, media_keys, active, sort, sample").eq("tenant_id", tenantId),
  ]);

  return toPublicCatalogue({
    events: check(events, "event_types").map(({ media_key, ...e }) => ({ ...e, mediaKey: media_key })),
    packages: check(packages, "packages").map(({ event_type_id, price_per_guest_paisa, min_guests, ...p }) => ({
      ...p,
      eventTypeId: event_type_id,
      pricePerGuestPaisa: price_per_guest_paisa,
      minGuests: min_guests,
    })),
    offers: check(offers, "offers").map(({ discount_kind, discount_value, starts_on, ends_on, ...o }) => ({
      ...o,
      discountKind: discount_kind,
      discountValue: discount_value,
      startsOn: starts_on,
      endsOn: ends_on,
    })),
    addons: check(addons, "addons").map(({ price_paisa, ...a }) => ({ ...a, pricePaisa: price_paisa })),
    stageThemes: check(themes, "stage_themes").map(({ price_paisa, media_keys, ...s }) => ({ ...s, pricePaisa: price_paisa, mediaKeys: media_keys })),
  });
}
