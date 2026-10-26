import type { SectionKey } from "@/modules/tenants";
import type { SiteView } from "../types";

export type EditTarget =
  | `package:${string}`
  | `package-new:${string}`
  | `event:${string}`
  | "event-new"
  | `offer:${string}`
  | "offer-new"
  | `addon:${string}`
  | "addon-new"
  | `stage-theme:${string}`
  | "stage-theme-new"
  | "venue:phones"
  | "venue:hours"
  | "venue:address"
  | "venue:manager"
  | "gallery:tiles"
  | "settings:theme"
  | "settings:sections"
  | "settings:venue"
  | `section:${SectionKey}`;

/** Marker the on-page editor looks for; empty on the public site, so its HTML is unchanged. */
export function editAttrs(site: SiteView, target: EditTarget, label: string): Record<string, string> {
  return site.editing ? { "data-edit": target, "data-edit-label": label } : {};
}
