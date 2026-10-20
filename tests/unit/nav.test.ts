import { describe, expect, it } from "vitest";
import { dashboardNav, type PermissionKey, type Viewer } from "@/modules/access";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

// Role defaults: the ✓ cells of the permission matrix in docs/JOURNEYS.md.
const ROLE_KEYS: Record<string, PermissionKey[]> = {
  manager: [
    "bookings.view", "bookings.edit", "quotes.override", "calendar.manage", "catalogue.edit", "prices.edit",
    "media.manage", "payments.view", "payments.verify", "enquiries.handle", "marketing.send", "schedule.manage",
    "schedule.view_own",
  ],
  accounts: ["bookings.view", "payments.view", "payments.verify", "schedule.view_own"],
  staff: ["schedule.view_own"],
};

const viewerAs = (role: string, tenantId = TENANT): Viewer => ({
  userId: "u",
  isPlatformAdmin: false,
  aal: "aal1",
  memberships: [{ tenantId, role, keys: ROLE_KEYS[role] }],
});

const labels = (viewer: Viewer, tenantId = TENANT) => dashboardNav(viewer, tenantId).map((i) => i.labelKey);

describe("dashboardNav", () => {
  it("shows staff only the schedule", () => {
    expect(dashboardNav(viewerAs("staff"), TENANT)).toEqual([
      { href: "/dashboard/schedule", labelKey: "nav.schedule" },
    ]);
  });

  it("shows accounts overview, bookings, calendar, payments and schedule", () => {
    expect(labels(viewerAs("accounts"))).toEqual([
      "nav.overview", "nav.bookings", "nav.calendar", "nav.payments", "nav.schedule",
    ]);
  });

  it("hides users and audit from a manager", () => {
    const items = labels(viewerAs("manager"));
    expect(items).toContain("nav.bookings");
    expect(items).not.toContain("nav.users");
    expect(items).not.toContain("nav.audit");
  });

  it("gives nothing for a tenant the viewer has no membership in", () => {
    expect(dashboardNav(viewerAs("manager", OTHER), TENANT)).toEqual([]);
  });

  it("shows every screen to a platform admin", () => {
    const admin: Viewer = { userId: "a", isPlatformAdmin: true, aal: "aal2", memberships: [] };
    expect(labels(admin)).toEqual(expect.arrayContaining(["nav.users", "nav.audit", "nav.settings"]));
  });
});
