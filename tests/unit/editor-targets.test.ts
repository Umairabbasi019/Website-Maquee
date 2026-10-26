import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/modules/access";
import { targetKeys, visibleTargets } from "@/modules/editor/client";

// Built-in role keys from 20261020000200_access.sql and 20261026000100_venue_info_key.sql.
const MANAGER: PermissionKey[] = [
  "bookings.view",
  "bookings.edit",
  "quotes.override",
  "calendar.manage",
  "catalogue.edit",
  "prices.edit",
  "media.manage",
  "payments.view",
  "payments.verify",
  "enquiries.handle",
  "marketing.send",
  "schedule.manage",
  "schedule.view_own",
  "venue.info.edit",
];
const ACCOUNTS: PermissionKey[] = ["bookings.view", "payments.view", "payments.verify", "schedule.view_own"];

const id = "7c1b2a4e-1111-4a5b-9c3d-000000000001";

describe("visibleTargets", () => {
  it("shows a manager the catalogue, venue info and gallery but not section copy", () => {
    const sees = visibleTargets(MANAGER);
    for (const target of [`package:${id}`, `package-new:${id}`, `offer:${id}`, "offer-new", "venue:hours", "gallery:tiles"] as const) {
      expect(sees(target), target).toBe(true);
    }
    expect(sees("section:hero")).toBe(false);
    expect(sees("settings:theme")).toBe(false);
  });

  it("shows accounts nothing", () => {
    const sees = visibleTargets(ACCOUNTS);
    for (const target of [`package:${id}`, `event:${id}`, "addon-new", "venue:phones", "gallery:tiles", "section:hero"] as const) {
      expect(sees(target), target).toBe(false);
    }
  });

  it("lets a prices-only editor change a package but not add one", () => {
    const sees = visibleTargets(["prices.edit"]);
    expect(sees(`package:${id}`)).toBe(true);
    expect(sees(`package-new:${id}`)).toBe(false);
    expect(sees("addon-new")).toBe(false);
  });

  it("gives section copy and the theme, sections and venue menus to tenant.settings.edit only", () => {
    expect(targetKeys("section:hero")).toEqual(["tenant.settings.edit"]);
    expect(targetKeys("settings:venue")).toEqual(["tenant.settings.edit"]);
    expect(visibleTargets(["tenant.settings.edit"])("section:hero")).toBe(true);
  });
});
