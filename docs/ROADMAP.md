# Roadmap

One milestone at a time. Each ends with a code review, checks actually run, docs updated, and a stop for approval. Sizes: S (≤1 day), M (2–4 days), L (5+ days) of focused work.

| ID | Milestone | Size | Depends on | Status |
|---|---|---|---|---|
| M0 | Planning documents | S | – | Done, approved 2026-10-19 |
| M1 | Foundation and security | L | M0 | Done, merged |
| M2 | Public site from config | L | M1 | Built on `feat/m2-public-site`, awaiting whole-branch review and merge |
| M3 | Venue configuration and catalogue | M | M1 | Not started |
| M4 | Booking engine and pricing | L | M3 | Not started |
| M5 | Payments | M | M4 | Not started |
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

## M4 Booking engine and pricing
Scope: pricing service, quote snapshots, availability, holds, exclusion constraint, state machine, booking tokens, live date and price calendar, booking flow, shareable quote, instant-booking setting, job runner with hold expiry.
Acceptance: customer reserves a free date and gets a reference and link; two simultaneous reserves → only one succeeds.
Tests: pricing unit tests (rounding, discounts, tax, advance), concurrency test, state transition tests, token access tests, Playwright booking journey.

## M5 Payments
Scope: ledger, manual receipts + verify, provider interface, sandbox adapter, webhook route with signature, idempotency and amount checks, auto-confirm, late-payment → Refund pending.
Acceptance: verified manual payment and sandbox webhook both confirm; a receipt alone or a redirect alone never confirms; duplicate webhook does nothing.
Tests: webhook idempotency and tamper tests, race test, Playwright receipt upload + verify.

## M6 Dashboard and operations
Scope: overview, booking calendar/list with payment state, dates to fill, bookings table with CSV import/export, enquiry tracker, duty schedule, run sheet, charts, users and permissions UI, audit log view.
Acceptance: Manor's sheet can be imported; manager runs a booking from enquiry to completed; staff see only their duty and run sheets.
Tests: CSV import mapping tests, permission matrix tests, Playwright staff journeys, chart data tests.

## M7 Notifications and jobs
Scope: messaging adapters (WhatsApp Cloud, email, dev log), templates, consent, delivery webhooks, reminders, morning summary, review request, "ready to send" state.
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
Current state: M0 and M1 are merged to `main`. M2 is built on branch `feat/m2-public-site` (Tasks 1-10 done) and awaits the whole-branch code review and your approval before merge.

Checks run on the branch (2026-10-24): lint and typecheck clean; 109 unit tests (17 files), 92 database tests (14 files) and 38 Playwright tests pass; `npm run build` passes.

Built in M2: site content block in tenant settings; catalogue slice (event types, packages, offers with RLS); media slice (public `venue-media` bucket, `media_assets` with pixel `dims`, seed upload); public site shell from tenant config (theme, fonts, SEO, JSON-LD, preview bar); sections hero, inside, stage, gallery, events, packages, contact and footer; scroll motion, reduced-motion and no-WebGL fallbacks, no-JavaScript output; responsive images; hero depth parallax layer with offline depth maps; QA specs; performance work (idle animation, `srcset`, off-hydration `Intl`, `content-visibility`).

Notes for M3:
- Show a "sample" badge in the dashboard while content or catalogue rows are marked sample; the public site stays noindex until they are not.
- Price columns need the `prices.edit` key; the catalogue tables use `catalogue.edit` for now.
- The media upload path must write `media_assets.dims` for every size, and `depth.png` when the hero mode is `depth`.
- The decorative duplicate hero and section `Shot`s need `alt=""` and `aria-hidden` (pending review).
- Lighthouse mobile performance is about 45-51 on Manor and 70-76 on the demo venue locally, against a target of 80. Local Lighthouse on this Windows machine is noisy and shows a suspect 16-21 s LCP. Recheck with PageSpeed Insights after the first deploy.
- Not built yet: audit log screen, users and permissions UI, deactivation screens (M6), staff invite flow, phone OTP login, "See stage themes" (M8).
- Run `npm run db:seed` before `npm run test:db` and `npm run test:e2e`. The seed uploads Manor photos from `MANOR_MEDIA_DIR`; set `SKIP_MANOR_MEDIA=1` to skip them.
