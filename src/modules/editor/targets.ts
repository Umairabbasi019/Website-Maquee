import type { PermissionKey } from "@/modules/access";
import type { EditTarget } from "@/sections/shared/edit";

const CATALOGUE_OR_PRICES: readonly PermissionKey[] = ["catalogue.edit", "prices.edit"];

// A new package, add-on or stage theme must carry a price (the schemas need one), so adding one needs both keys.
const NEEDS_EVERY_KEY = /^(package-new:|addon-new$|stage-theme-new$)/;

/** The keys behind a ✎ target: any one is enough, except for the new priced rows above, which need all of them. */
export function targetKeys(target: EditTarget): readonly PermissionKey[] {
  if (target.startsWith("venue:")) return ["venue.info.edit"];
  if (target === "gallery:tiles") return ["catalogue.edit"];
  if (target.startsWith("section:")) return ["tenant.settings.edit"];
  // A new event or offer needs only catalogue.edit (an offer's discount is optional).
  if (target === "event-new" || target === "offer-new") return ["catalogue.edit"];
  return CATALOGUE_OR_PRICES;
}

/** Which ✎ targets a viewer holding `keys` gets. UX only: every save is checked again on the server. */
export function visibleTargets(keys: readonly PermissionKey[]): (target: EditTarget) => boolean {
  const held = new Set(keys);
  return (target) => {
    const needed = targetKeys(target);
    return NEEDS_EVERY_KEY.test(target) ? needed.every((k) => held.has(k)) : needed.some((k) => held.has(k));
  };
}
