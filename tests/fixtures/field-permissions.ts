import type { PermissionKey } from "@/modules/access";

export type FieldPermission = {
  part: "events" | "packages" | "offers" | "addons" | "stageThemes" | "identity" | "content" | "theme" | "sections" | "messaging";
  /** Draft path inside the part, dot-separated (array items by index). */
  field: string;
  /** SQL column, for catalogue parts. */
  column?: string;
  key: PermissionKey;
};

/** Which key a change to each field needs. The SQL triggers and the editor's requiredKeys both follow it. */
export const FIELD_PERMISSIONS: FieldPermission[] = [
  { part: "events", field: "name", column: "name", key: "catalogue.edit" },
  { part: "events", field: "mediaKey", column: "media_key", key: "tenant.settings.edit" },
  { part: "packages", field: "name", column: "name", key: "catalogue.edit" },
  { part: "packages", field: "pricePerGuestPaisa", column: "price_per_guest_paisa", key: "prices.edit" },
  { part: "offers", field: "title", column: "title", key: "catalogue.edit" },
  { part: "offers", field: "discountKind", column: "discount_kind", key: "prices.edit" },
  { part: "offers", field: "discountValue", column: "discount_value", key: "prices.edit" },
  { part: "offers", field: "startsOn", column: "starts_on", key: "prices.edit" },
  { part: "offers", field: "endsOn", column: "ends_on", key: "prices.edit" },
  { part: "addons", field: "name", column: "name", key: "catalogue.edit" },
  { part: "addons", field: "pricePaisa", column: "price_paisa", key: "prices.edit" },
  { part: "stageThemes", field: "name", column: "name", key: "catalogue.edit" },
  { part: "stageThemes", field: "pricePaisa", column: "price_paisa", key: "prices.edit" },
  { part: "identity", field: "phones", key: "venue.info.edit" },
  { part: "identity", field: "address", key: "venue.info.edit" },
  { part: "identity", field: "openingHours", key: "venue.info.edit" },
  { part: "content", field: "contact.manager", key: "venue.info.edit" },
  { part: "content", field: "gallery.tiles", key: "catalogue.edit" },
  { part: "content", field: "packages.defaultEvent", key: "catalogue.edit" },
  { part: "identity", field: "name", key: "tenant.settings.edit" },
  { part: "theme", field: "colors.primary", key: "tenant.settings.edit" },
  { part: "sections", field: "0.visible", key: "tenant.settings.edit" },
  { part: "messaging", field: "whatsappNumber", key: "tenant.settings.edit" },
  { part: "content", field: "hero", key: "tenant.settings.edit" },
  { part: "content", field: "sample", key: "tenant.settings.edit" },
];
