// Keep in step with the `permissions` rows in supabase/migrations/20261020000200_access.sql.
export const PERMISSIONS = [
  "platform.tenants.manage",
  "tenant.settings.edit",
  "users.manage",
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
  "reports.view",
  "schedule.manage",
  "schedule.view_own",
  "audit.view",
  "venue.info.edit",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];
