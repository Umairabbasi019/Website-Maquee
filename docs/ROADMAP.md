# Roadmap

One milestone at a time. Each ends with a code review, checks actually run, docs updated, and a stop for approval. Sizes: S (≤1 day), M (2–4 days), L (5+ days) of focused work.

| ID | Milestone | Size | Depends on | Status |
|---|---|---|---|---|
| M0 | Planning documents | S | – | Done, approved 2026-10-19 |
| M1 | Foundation and security | L | M0 | Done, merged |
| M2 | Public site from config | L | M1 | Done, merged |
| M3 | Venue configuration and catalogue | M | M1 | Done, merged |
| M4 | Booking requests and pricing | L | M3 | Done, merged |
| M5 | Payments | M | M4 | Built on `feat/m5-payments`, awaiting review and merge |
| M6 | Dashboard and operations | L | M4, M5 | Not started |
| M7 | Notifications and jobs | M | M4 | Not started |
| M8 | Customer extras: stage preview, invite + RSVP | M | M4, M7 | Not started |
| M9 | Automatic marketing | M | M6, M7 | Not started |
| M10 | QA, hosting and launch | M | all | Not started |

## M1 Foundation and security
Scope: Next.js + TypeScript + Tailwind tokens, module folders and import lint rule, Supabase local, migrations for `tenants` and `access`, auth, memberships, permission keys, `can()`, RLS helpers, audit writer, super admin console shell (tenant list, create from template, open tenant), two demo tenants seeded, `.env.example`.
Acceptance: super admin creates a second tenant without code; users see only permitted screens; deactivation works.
Tests: RLS negative tests for every table so far; `can()` unit tests; Playwright login + permission-hidden screens.

## M2 Public site from config
Scope: port mockup v6 sections into `src/sections/*` fed by tenant settings; theme tokens; section order/visibility; responsive image variants; reduced motion; SEO metadata and schema; holding page for paused tenants.
Acceptance: Manor site matches the approved mockup at 1440 and 375; demo tenant 2 looks different with no code change.
Tests: Playwright screenshots both tenants, reduced motion, no-WebGL; Lighthouse mobile check reported.

## M3 Venue configuration and catalogue
Scope: halls, slots, event types, packages, menus, add-ons, stage themes, offers, date prices, money rules, feature switches, media library with uploads and size variants.
Acceptance: owner/manager edits a price and the public site shows it; super admin edits any tenant; changes audited.
Tests: Zod schema tests; permission tests per screen; media upload Playwright.

## M4 Booking requests and pricing
Scope: pricing service, quote snapshots, public request form with an optional estimate, private booking link, state machine with history (`requested`, `confirmed`, `declined`, `cancelled`), exclusion constraint on `confirmed`, staff bookings list, detail and month calendar, confirm with hall pick and optional price override, decline and cancel with a reason, new-request count on the overview, rate limit. The public site shows no availability.
Acceptance: a customer sends a request for any future date and gets a reference and a link; two simultaneous confirms of the same hall, date and slot → only one succeeds.
Tests: pricing unit tests (rounding, discounts, tax, advance, override), concurrency test, state transition tests, token access tests, Playwright request and confirm journeys (also with JavaScript off).
Moved out: holds, quick booking and the manager switch to M5; the job runner (and pruning `booking_request_hits`) to M7; the shareable family quote (BKG-8) to M8; staff-made bookings to M6.

## M5 Payments
Scope: the quick-booking manager switch (pay and auto-book, with `awaiting_advance` and holds using `holdHours`), ledger, manual receipts + verify, provider interface, sandbox adapter, webhook route with signature, idempotency and amount checks, auto-confirm, late-payment → Refund pending.
Acceptance: verified manual payment and sandbox webhook both confirm; a receipt alone or a redirect alone never confirms; duplicate webhook does nothing.
Tests: webhook idempotency and tamper tests, race test, Playwright receipt upload + verify.

## M6 Dashboard and operations
Scope: overview, booking calendar/list with payment state, dates to fill, bookings table with CSV import/export, enquiry tracker, duty schedule, run sheet, charts, users and permissions UI, audit log view.
Acceptance: Manor's sheet can be imported; manager runs a booking from enquiry to completed; staff see only their duty and run sheets.
Tests: CSV import mapping tests, permission matrix tests, Playwright staff journeys, chart data tests.

## M7 Notifications and jobs
Scope: job runner (hold expiry, pruning old `booking_request_hits`), messaging adapters (WhatsApp Cloud, email, dev log), templates, consent, delivery webhooks, reminders, morning summary, review request, "ready to send" state.
Acceptance: with dev log adapter all messages are recorded with honest states; with sandbox WhatsApp a template is accepted and delivery status updates.
Tests: dedupe tests, time-zone schedule tests, STOP handling, no-provider honesty test.

## M8 Customer extras
Scope: stage theme preview, invite editor, invite page with RSVP, expiry.
Acceptance: family shares an invite; RSVP totals update; page is noindex and expires.
Tests: Playwright invite + RSVP, token tests.

## M9 Automatic marketing
Scope: campaigns, audiences, fill empty dates + badge, follow-ups, hold nudge, season templates, anniversary, referral links, caps, results.
Acceptance: promoting a free date sends only to opted-in matching leads within the cap; opt-out stops everything at once.
Tests: audience and cap tests, referral pricing tests, opt-out tests.

## M10 QA, hosting and launch
Scope: choose hosting, deploy, domains and HTTPS, backups, monitoring, security review, accessibility and performance pass, real Manor content swapped in, launch checklist (`QA_CHECKLIST.md`).
Acceptance: every launch checklist item verified, not assumed.

## Handoff
Current state: M0 to M4 are merged to `main`. M5 (payments) is built on `feat/m5-payments`; it needs the milestone code review and merge. Next is M6.

Checks run on the M3 branch (2026-10-26, after `npm run db:seed`): lint and typecheck clean; 225 unit tests (26 files), 184 database tests (21 files) and 59 Playwright tests pass; `npm run build` passes.

Built in M3: `venue.info.edit` key; add-ons, stage themes and offer discounts; hall hire price; field-level permissions (SQL triggers, TS mirror and one tested table); audited direct writes for halls, slots and date prices; date prices with an overlap rule; site drafts and atomic audited Publish; the on-page editor at `/dashboard/site` (draft, ✎ panels, phone preview, publish, discard); add-ons and stage themes on the public site; media library with uploads, size variants, alt text, replace, delete and depth maps; settings screen (halls, slots, date prices, money rules); the guard on `/dashboard?tenant=`.

Checks run on the M4 branch before merge (2026-10-28, after `npm run db:seed`): lint and typecheck clean; 312 unit tests, 257 database tests (25 files) and 74 Playwright tests pass; `npm run build` passes.

Built in M4: the pricing service (integer paisa, half-up rounding to the rupee once per line, date prices, tax, advance, override); booking tables, guards and the service-role SQL functions; the public request form at `/book` (works without JavaScript) with an optional estimate; `/book/sent` and the private link `/b/<token>`; the staff bookings list, detail and confirm, decline and cancel at `/dashboard/bookings`; the month calendar at `/dashboard/calendar`; the new-request count on the overview; the `showPriceEstimate` setting; sample bookings in the Manor seed.

Checks run on the M5 branch (2026-10-29, after `npm run db:seed`): lint and typecheck clean; 412 unit tests (40 files), 344 database tests (30 files) and 88 Playwright tests (17 files, run in three chunks of spec files) pass; `npm run build` passes. The first full Playwright run timed out in 5 tests at the 18-minute mark (slow machine); each passed when rerun in chunks.

Built in M5: the payments schema (ledger, provider event log, private receipts bucket, `no_overlap` with holds, four new statuses); service-role SQL functions for payments, holds, quick booking, cancel choice and alerts; the `payments` module (ledger maths, receipt upload, staff actions, alerts); the customer payment panel on `/b/<token>`; quick booking with holds and the manager switch; the provider interface with the dev-only sandbox, `/pay/sandbox/[ref]` and the webhook `/api/payments/webhook/[provider]`; the staff ledger on the booking page and dashboard alerts; sample payment accounts, one verified advance and one pending receipt in the Manor seed. A receipt or a redirect never confirms a booking.

Notes for M7: add the job that expires holds on time (today the next write that needs the slot does it), and WhatsApp alerts for receipts waiting, advance overdue and refund due (alerts are dashboard only in M5). Also prune `booking_request_hits`.
Notes for M6: payment lists and reports on `/dashboard/payments` (planned), payment state in the bookings table and calendar.
Known limits for M5: no real gateway adapter (the sandbox is refused in production builds, so the `gateway` method cannot be on there); `getStatus` cannot check amount and currency until a real adapter widens it; refunds are recorded by hand; quick booking picks halls in name order.

Notes for M8: stage themes are priced rows with photo keys; the public Packages section lists them, and the preview and picker are still to build.

Not built yet: audit log screen, users and permissions UI, deactivation screens (M6), staff invite flow, phone OTP login, "See stage themes" (M8), menus as separate tables, hall delete, undo of a single draft change.

Known limits:
- With JavaScript off, a dashboard Server Action that returns an error re-renders into a Next 16.4 InvariantError about cookies in `createServerClient`. The staff dashboard works with JavaScript; the fix is planned in the access module.
- The booking estimate action has no rate limit of its own; the production proxy fallback for Server Action redirects is verified against Next 16.4.2 source only, not on Vercel.
- Uploads pass through the Next server (16 MB body limit); Vercel caps bodies at 4.5 MB, so switch to signed direct uploads before deploying there.
- `require_publishing()` trusts `app.publishing`; a session with raw SQL as `authenticated` could set it (see `DECISIONS.md`).
- The hours panel edits one window per day; a second window stored by hand is kept and noted, but cannot be edited there, and goes when the day is marked closed.
- Venue and theme panels save each changed value as its own draft change; if one fails mid-way, earlier values stay in the draft (never live; Publish is atomic). One batched save action would fix it.
- A photo with no stored size counts as square in the gallery panel.
- A date-price check-then-save race still throws instead of returning a message.
- Lighthouse mobile performance from M2 is unchanged: about 45-51 on Manor and 70-76 on the demo venue locally, against a target of 80. Recheck with PageSpeed Insights after the first deploy.
- Run `npm run db:seed` before `npm run test:db` and `npm run test:e2e`. The seed uploads Manor photos from `MANOR_MEDIA_DIR`; set `SKIP_MANOR_MEDIA=1` to skip them.
