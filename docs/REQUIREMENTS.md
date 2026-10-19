# Requirements

IDs are referenced by the roadmap and tests. "Must" items are MVP.

## MVP

### Platform and tenants (TEN)
- TEN-1 Super admin creates a tenant from a template, with a setup checklist (domain, numbers, prices, photos, payment accounts).
- TEN-2 Account → venues → halls. One account can hold several venues.
- TEN-3 Each venue resolves from its custom domain; a platform subdomain (`slug.<platform-domain>`) works before DNS is ready.
- TEN-4 Everything about a tenant is configurable without code: identity, theme, sections, halls, slots, events, packages, menus, add-ons, stage themes, offers, money rules, messaging, feature switches, login limit (spec §3).
- TEN-5 Super admin can open any tenant and change anything; every change is audited under their name.
- TEN-6 Pause a tenant (holding page, logins blocked, data kept) and export its data as CSV.
- TEN-7 Per-tenant secrets (payment, WhatsApp) stored encrypted on the server, write-only in the UI.
- TEN-8 Two demo tenants with different branding prove the codebase is shared.

### Users and permissions (USR)
- USR-1 Roles: super admin, venue owner, manager (default 2 per venue), accounts, staff, customer (no login).
- USR-2 A role is a set of permission keys; super admin can grant or remove single permissions per user.
- USR-3 Users see only their venue and only screens they are allowed to use; the server and RLS re-check every action.
- USR-4 Login limit per tenant set by super admin.
- USR-5 Deactivate a user at once; sessions end, audit history keeps their name.
- USR-6 Negative tests prove no cross-tenant or cross-customer access.

### Public website (WEB)
- WEB-1 Approved cinematic one-page site (Hero, Inside, Stage, Gallery, Events, Packages, Contact, Footer) built from tenant config.
- WEB-2 Sections can be shown, hidden and reordered per tenant.
- WEB-3 Image size chosen by screen long side × pixel ratio (≤1400 small, ≤2200 medium, else large). Full-screen only from sources ≥1600 px.
- WEB-4 Reduced motion: static and fully readable. Works without WebGL.
- WEB-5 Live Open/Closed in venue time zone; click-to-WhatsApp and call always available.
- WEB-6 SEO: per-venue metadata, local business schema, sitemap, robots; private pages noindex.
- WEB-7 Content strings in a locale layer (Urdu later).

### Booking (BKG)
- BKG-1 Live date and price calendar: free, held, booked (no customer data) and price per free date.
- BKG-2 Flow: date → event → guests → package → itemised estimate → Reserve (name, phone, WhatsApp consent).
- BKG-3 Hold for a configurable time (default 48 h), expired on the server.
- BKG-4 Double booking impossible at database level, including two people reserving at once.
- BKG-5 Private, expiring, unguessable booking link for the customer.
- BKG-6 Controlled state machine (spec §6) recording who, when, why.
- BKG-7 Optional instant booking at standard package price (tenant setting).
- BKG-8 Shareable family quote page (read-only, expiring, no phone numbers, noindex).

### Pricing (PRC)
- PRC-1 One tested server-side pricing service; browser totals never trusted.
- PRC-2 Inputs: hall hire, per-guest price × guests, add-ons, decor, date pricing, offers, referral discount, tax, advance rule.
- PRC-3 Integer paisa; rounding rule documented in the module.
- PRC-4 Immutable quote snapshot per agreed quote; overrides need a reason and are audited.

### Payments (PAY)
- PAY-1 Manual: bank, JazzCash, Easypaisa + receipt upload; staff verification books the date.
- PAY-2 Provider interface (`createPayment`, `verifyWebhook`, `getStatus`, `refund`) with a sandbox adapter.
- PAY-3 Auto-book only on a server-verified provider confirmation (signature, booking, amount, currency, not a repeat). Redirect pages never confirm.
- PAY-4 Payment for a date taken after hold expiry → Refund pending + manager alert.
- PAY-5 Ledger per booking with method, provider reference and recorder.
- PAY-6 Money goes to the venue's own accounts.

### Dashboard and operations (OPS)
- OPS-1 Overview: today, upcoming, enquiries, advances due, balances, alerts.
- OPS-2 Booking overview calendar and list with payment state; "Dates to fill" list.
- OPS-3 Sheet-like bookings table with filters and CSV import/export.
- OPS-4 Calendar management: block, hold, release, date pricing.
- OPS-5 No-lost-enquiry tracker with reply timer (default 15 min in opening hours) and escalation.
- OPS-6 Staff duty schedule (day/week/month), each person sees their own.
- OPS-7 Event-day run sheet (phone and print).
- OPS-8 Charts: bookings, revenue, collected vs outstanding, occupancy, popular events/packages, conversion; date filters.
- OPS-9 Menus, packages, offers, stage themes, media library (replace photos without code).
- OPS-10 Audit log view.

### Notifications (NTF)
- NTF-1 WhatsApp Cloud API adapter + email adapter + dev log adapter.
- NTF-2 Consent tracking, approved templates, delivery states (recorded, queued, accepted, delivered, failed), retries.
- NTF-3 Scheduled reminders in venue time zone with duplicate-send protection.
- NTF-4 Morning summary to owner and managers (default 9 AM).
- NTF-5 Review request the day after Completed, to every opted-in customer (no review gating).
- NTF-6 Without a provider, messages show as "ready to send" with a click-to-WhatsApp button, never as sent.

### Customer extras (CUS)
- CUS-1 Stage theme preview on the venue's real stage photo (real or offline composites labelled "illustration").
- CUS-2 Digital invite + RSVP page with live totals; unlisted, noindex, expires after the event.

### Marketing (MKT)
- MKT-1 Opt-in only, STOP opt-out honoured at once, frequency cap (default 1 per week), Meta-approved templates.
- MKT-2 Fill empty dates: discount on a free date, "Special price" badge, offer to matching opted-in leads.
- MKT-3 Enquiry follow-ups (day 1, 3, 7) stop on reply, booking or opt-out.
- MKT-4 Hold expiry nudge 12 h before expiry.
- MKT-5 Season campaign templates (wedding season, Eid, year-end corporate).
- MKT-6 Anniversary greeting with offer.
- MKT-7 Referral links with tracked codes and discounts.
- MKT-8 Campaign results: sent, delivered, replied, bookings, revenue.

### Built for change (CHG)
- CHG-1 Feature modules with one public entry file each; no cross-module imports of internals (lint rule).
- CHG-2 Providers behind adapters.
- CHG-3 Business values in tenant settings.
- CHG-4 "Where to change what" table kept current in `ARCHITECTURE.md`.

## Later
- Live bank or gateway adapter (when merchant account is ready); bank statement auto-matching.
- Urdu content.
- Owner's drone/gimbal video as image sequences.
- Hall detail pages, full menu page, decor catalogue page, FAQ and policy pages.
- Event planning board with tasks and assignees.
- Tenant subscription billing and plans (feature switches already exist).
- Expenses and margin reports.

## Out of scope
- Self sign-up for tenants.
- 3D model or 360° tour (seam kept).
- Vendor marketplace, inventory, supplier management.
- Live AI image generation.
