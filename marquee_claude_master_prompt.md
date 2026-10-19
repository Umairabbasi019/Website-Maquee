# Marquee Management Platform — Claude Master Build Prompt

Use this as the project brief for **Claude Code**. It is deliberately designed to run one milestone at a time to keep context and token use under control.

## How to use this file

1. Create a new Git repository for the project and open it in Claude Code.
2. Put your uploaded reference video in `references/visual-reference.mp4`. If your coding environment cannot inspect video files, save 4–8 representative frames as JPG/PNG in `references/frames/` and ask Claude to inspect those.
3. Paste the prompt in **Section A** into Claude Code. The first run must only produce a plan and project documents; it must not build the entire application.
4. Review the outputs. Then ask Claude to execute one milestone at a time using the commands in **Section D**.
5. Keep the separate `CLAUDE.md` starter file in the repository root. Claude should read it at the beginning of each session.

---

# Section A — Master prompt (paste into Claude Code)

## Your role

Act as a senior product manager, SaaS solution architect, luxury hospitality website art director, senior UX/UI designer, full-stack engineer, database/security engineer, and QA lead. Build a production-minded, reusable, multi-venue marquee/event venue management platform. Do not behave like a one-shot website generator. First design the system, define requirements and acceptance criteria, then implement it in approved milestones.

## Product vision

Build a cinematic, modern, immersive 3D website and operational booking system for wedding marquees, banquet halls, event venues, and similar event spaces. It must work for the first marquee now and be configurable for other marquees later without duplicating the codebase.

Treat this as a **multi-tenant / white-label platform**. A platform owner can add venues. Each venue can independently configure its brand, logo, color theme, custom domain or venue slug, halls/spaces, capacities, packages, menu, decorations, pricing, operating hours, booking rules, media, contact details, policies, staff, and notifications. Tenant isolation is a core requirement, not a later patch.

The public website must feel like a premium architectural / hospitality experience, not a generic template. The admin system must be practical and fast for daily operations. The public website and admin dashboard may have different visual density, but they must share a consistent design system.

## Visual reference and assumptions

I supplied a short video showing a cinematic architectural walkthrough: open modern spaces, garden views, warm natural lighting, long shadows, and slow camera movement. Use this as a **visual mood reference**, not as proof of a particular UI or of the actual marquee's architecture.

Current assets are placeholders. The real marquee's photos, videos, logo, pricing, and menus will be uploaded later. Build a media/configuration system that makes replacing them easy. Never claim that placeholder stock images show the actual venue. Do not scrape random sites or copy another venue's copyrighted media.

Choose one cohesive art direction: premium architectural editorial, warm stone/ivory, charcoal, muted champagne/brass accents, high-quality typography, deep imagery, carefully layered depth, elegant transitions, spacious layouts, and clear calls to action. Avoid a generic SaaS look, excessive rounded cards, neon/purple gradients, random floating objects, too many particles, and motion that distracts from booking.

### 3D and motion requirements

- Use a lightweight 3D/2.5D hero experience. Prefer a cinematic video/image hero with depth, parallax, ambient light, tasteful particles, and slow camera-like movement until real 360° imagery or a 3D model is provided.
- Architecture for a future real venue walkthrough must support panoramic media or a replaceable GLB/GLTF model. Do not fabricate a photorealistic model and imply it is the actual site.
- Use React Three Fiber / Three.js only where it adds real value. Load heavy 3D code lazily, add a poster/fallback for WebGL failure, reduce quality on mobile, respect `prefers-reduced-motion`, and ensure the booking form remains usable without WebGL.
- Use one primary UI animation system. Use Motion for common interface transitions; add GSAP/ScrollTrigger only if a specific scroll-driven effect genuinely requires it. Avoid overlapping animation libraries for the same interaction.
- Use slow image reveals, tasteful parallax, subtle scroll transitions, hover depth, and smooth navigation. Every motion effect needs a static/reduced-motion fallback.

## Proposed technical direction

Use the latest stable, mutually compatible versions at implementation time. Confirm versions from official documentation before adding packages.

- **Application:** Next.js App Router, React, TypeScript, server-side validation, accessible semantic HTML.
- **Styling/components:** Tailwind CSS and shadcn/ui where useful. Create a custom design system; do not make every page look like an unmodified component library.
- **Database/auth/storage:** Supabase Postgres, Supabase Auth, Supabase Storage, and Row Level Security (RLS). Use migrations committed to Git. Do not rely on client-side filtering for tenant security.
- **Motion/3D:** Motion for UI; Three.js + React Three Fiber and Drei for the optional immersive scene. Lazy load it.
- **Forms/validation:** React Hook Form and Zod if beneficial; validate again on the server.
- **Testing:** unit/integration tests plus Playwright browser tests for key customer/admin journeys.
- **Deployment:** keep the app deployable to a mainstream Next.js host and Supabase, with environment variables and setup docs. Do not deploy until requested.
- **Integrations:** use provider adapters for payments, email, WhatsApp, calendar, and media. Secrets must remain on the server. Local/test mode must work when external credentials have not been supplied.

Do not install every possible library. Check the existing repository first, propose additions only when needed, and avoid redundant dependencies.

### Configurable defaults

Use the following as demo defaults, not hard-coded rules:

- Locale/time zone: `Asia/Karachi`.
- Currency: `PKR`, configurable per venue.
- Language: English first, structured so additional languages can be added later.
- Demo venue: a fictional sample venue clearly labeled as demo content.
- Booking deposit: configurable per venue as a fixed amount or percentage.
- Tenant routing: a venue slug first; custom domains can be configured later.

Do not assume the user has already purchased a payment gateway, WhatsApp Business API, domain, or stock-media API account. Build clean interfaces and setup instructions so those credentials can be added later.

## Roles and access

Design explicit permission rules for:

1. **Platform super admin:** creates/pauses venues, manages platform-level defaults, views tenant health, and manages tenant membership; access is audited.
2. **Venue owner/admin:** configures their own venue, staff, pricing, menus, decoration catalogue, media, bookings, and reports.
3. **Manager/event coordinator:** manages bookings, event plans, customer communication, checklists, assigned tasks, and event status within their venue.
4. **Finance staff:** views invoices, deposits, payments, balances, refunds, and finance reports as permitted.
5. **Operations/staff:** views assigned tasks and event information needed for their job; cannot change prices or tenant settings unless permission is granted.
6. **Customer:** can submit an inquiry/booking, view only their own booking(s), review quote and event details, submit requested details, and view payment status.

Each venue has multiple user accounts, each with its own login. The venue owner/admin can invite staff by email or phone, assign one or more roles, set per-feature permissions (for example: edit menu, edit prices, record payments, view reports), deactivate or remove a user, and reset their access. Several people can hold the same role (for example two managers). Every user sees only the dashboard sections their role allows, and every change they make is recorded in the audit log under their name.

Use tenant memberships and role-based authorization. Every tenant-owned database record must be scoped to a tenant. Implement RLS policies, server-side authorization, and negative tests proving one venue/customer cannot access another venue/customer's private records. Never trust a tenant ID supplied by the browser as the source of authorization.

## Main public website

Implement a configurable site for each venue with:

- Immersive home page with a hero video/photo/optional 3D scene, venue introduction, availability/booking CTA, venue highlights, event types, spaces/halls, packages, selected gallery media, menu preview, decor inspiration, testimonials/demo reviews, FAQs, location/contact, and footer.
- Venue/hall detail pages with capacity, dimensions/features where configured, indoor/outdoor options, gallery, included facilities, accessibility information, and indicative pricing when enabled.
- Gallery with categorized photos/videos: hall, stage, entrance, garden, table layouts, lighting, food, and decorations.
- Packages/services page with inclusions and exclusions.
- Menu page with categories, menu items, per-plate prices where public, optional add-ons, dietary/allergen notes, and custom-menu request flow.
- Decoration/theme catalogue with reference images, included items, optional upgrades, and custom-request notes.
- Availability and booking flow, contact/WhatsApp CTA, policies, privacy, terms, and cancellation/refund information configurable by the venue.
- Search-engine metadata, social previews, local business schema where appropriate, sitemap, robots.txt, and fast page loading.

Do not expose internal costs, other customer data, staff notes, or non-public pricing rules in public pages.

## Booking and availability flow

A customer should be able to:

1. Choose the venue and hall/space, date, start/end time or booking slot, event type, approximate guest count, and optional package.
2. View availability and avoid unavailable or conflicting times.
3. Select menu options, custom-menu requests, decor/theme, add-ons, and special requirements.
4. Enter contact details and explicitly consent to relevant communication.
5. Review an itemized quote, deposit requirement, amount due later, cancellation terms, and expiry of any temporary hold.
6. Submit a booking/inquiry and receive a reference number and clear next step.
7. Track booking status via a secure account or expiring secure link. Never expose a booking through a predictable sequential ID alone.
8. Submit/update final event details, menu choices, estimated guest count, stage/decor notes, and relevant attachments until the configured cutoff date.

Availability checks must account for venue operating hours, slot duration, setup/teardown buffer, hall capacity, other confirmed bookings, active temporary holds, blackout dates, and admin overrides. Prevent double booking at the database/server level, not just in the UI. Temporary holds must expire. Use transactions/appropriate constraints or locking to handle two customers trying to reserve the same slot at once.

## Booking statuses and operational stages

Use named statuses in the interface and a controlled state-transition service. A suggested flow is:

`Inquiry → Quote prepared → Awaiting deposit → Deposit received / Confirmed → Planning → Ready for event → In progress → Completed`

Use separate outcomes for `Declined`, `Cancelled`, `Expired hold`, `Refund pending`, and `Refunded` as appropriate. Venue settings may adapt labels, but not bypass permission checks or financial verification.

When a deposit is confirmed by a verified gateway webhook or by an authorized staff member recording a verified offline payment, update the financial status and move the booking to the configured confirmed stage. A screenshot uploaded by a customer is only proof submitted for review; it is **not proof of successful payment** and must not automatically mark an invoice paid. Record every state change with who changed it, when, and why. Send a customer notification only after the state change succeeds.

## Automatic quote and amount calculation

Create a single server-side pricing engine with tests. It should calculate an estimate/quote from configurable rules, including:

- hall/venue hire base price and duration;
- event type and selected date/time;
- per-guest/per-plate menu price × guest count;
- selected menu upgrades and add-ons;
- decoration/theme package and custom extras;
- extra hours, setup/teardown, equipment, services, or staffing if configured;
- weekend/peak/seasonal surcharges;
- discounts/coupons where enabled;
- taxes/service charges where configured by the venue;
- required deposit (fixed or percentage), amount paid, and remaining balance.

Show an understandable itemized breakdown. Define rounding and currency precision explicitly. Store monetary values safely (integer minor units or an explicit decimal strategy; never use floating-point arithmetic for money). Save a quote snapshot/version on the booking so later price-list changes do not rewrite a customer's agreed quote. Recalculate on the server and never trust a price sent by the browser. Allow authorized staff to override a quote with a required reason and audit entry. Make it possible to report booked revenue, collected payments, outstanding balances, and estimated internal cost/margin separately.

## Admin dashboard and venue operations

Create a responsive, useful dashboard with:

- Today/upcoming events, pending inquiries, quotes awaiting response, deposits due/received, remaining balances, conflicts/alerts, and key KPIs.
- Calendar/list views with filters by hall, date, status, and coordinator.
- Date management on the calendar: block/unblock a date or slot, place or release a manual hold, set date-specific pricing (peak/wedding-season/discount days), and see at a glance which dates are free, held, booked, or blocked.
- Staff schedule: who is on duty for each event and day (manager, coordinator, kitchen, decor, security), with day/week/month views and each staff member seeing their own upcoming schedule.
- Charts and graphs on the dashboard: bookings and revenue over time, collected vs outstanding payments, occupancy by month/hall, popular event types and packages, inquiry-to-booking conversion, with date-range filters.
- Booking/customer records, status timeline, notes, documents, quote revisions, payment ledger, and communication history.
- A visual event-planning board or timeline with phases, tasks, assignee, deadline, priority, completion state, and reminders.
- Per-event operational sheet: customer and event details, final guest estimate, selected hall, confirmed menu, decoration plan, add-ons, special requests, suppliers/staff notes, setup timing, and checklist.
- Menu builder with categories, items, descriptions, price rules, dietary labels, menu availability, custom-menu options, and versioned menu snapshots for confirmed events.
- Decoration catalogue: theme, reference media, included components, optional upgrades, pricing, inventory/availability notes, and custom-request field.
- Venue/hall setup: capacity, base pricing, slot rules, opening hours, setup/teardown buffers, blackout dates, facilities, media, and public visibility.
- Pricing rules, packages, add-ons, tax/discount configuration, deposit rules, and quote templates.
- Media library: upload, preview, categorize, reorder, set hero/gallery/video poster, add alt text, source/license/attribution, and replace placeholder media.
- Staff/membership management, permission assignment, notification preferences, business hours, policies, logo/colors/fonts/theme, public content, and tenant setup wizard.
- Reports: booking pipeline, occupancy/utilization, inquiry-to-booking conversion, revenue collected, unpaid balances, cancellation rate, optional expenses and estimated margin, with date filters and CSV export.
- Audit log for sensitive actions and a useful empty state for new venues.

All forms, tables, filters, buttons, upload states, error states, empty states, and mobile layouts must work. Do not ship dead buttons or fake success messages.

## Payment integrations

Build an integration interface so a provider can be added without rewriting the booking system. First implement manual/offline payment recording and sandbox/test-mode behavior. Select the real provider after account eligibility and country/currency requirements are confirmed. If the first venue operates in Pakistan, consider a compatible local gateway such as Safepay after verifying its current merchant requirements; do not assume approval or live credentials.

Requirements:

- deposit and balance payments, payment attempt history, receipts, refunds/adjustments where supported, and a reconciled ledger;
- verified server-side gateway webhooks with signature/secret validation, idempotency, and duplicate-event protection;
- clear pending/success/failed/cancelled states;
- no card secrets or provider secret keys in the browser;
- test/sandbox path, setup guide, webhook setup guide, and tests.

Do not claim the payment integration is live until real credentials, webhook setup, and a successful test have been verified.

## WhatsApp, email, and reminders

Use a provider abstraction for official WhatsApp Business Platform/Cloud API or an approved business solution provider. Build:

- click-to-WhatsApp as an immediate fallback;
- configurable notification templates for inquiry received, quote ready, deposit pending, payment verified, booking confirmed, requested-details reminder, event reminder, balance reminder, booking changes, cancellation, and completion/feedback;
- customer consent/opt-in tracking, approved template handling where required, phone formatting, retry/error records, webhook/delivery status tracking when available, and an admin communication log;
- transactional email adapter with a development log mode;
- scheduled reminders based on event date and due dates, with duplicate-send prevention and time-zone awareness.

Do not simulate that a WhatsApp message was delivered when no provider is connected. Clearly distinguish an internal notification record, a queued send, provider acceptance, and delivery status.

## Media and placeholder assets

Create an asset pipeline so placeholder media can be replaced without code changes. Use a curated demo media manifest with fields like `id`, `tenant_id`, `url/storage_path`, `kind`, `category`, `alt_text`, `caption`, `sort_order`, `is_hero`, `is_published`, `source`, `license`, `attribution`, and `uploaded_by`. Do not store all images as database blobs.

For placeholder photos/videos, use a legitimate stock source such as Pexels (API key only if needed, respecting its API terms and attribution requirements) or bundled neutral placeholder assets. Avoid scraping. Keep a source/attribution record and never imply stock imagery is the actual venue. Use optimized responsive images, poster frames for video, compressed/streamable video, poster fallback, and lazy loading. Provide an admin replace-media workflow and a checklist for replacing all demo assets before production.

Image motion/animation is not the same as AI upscaling. Build tasteful motion effects and optimized image handling now. Treat true AI upscaling/enhancement as an optional future provider integration; do not claim it exists unless an actual enhancement service is configured.

## Suggested data model to evaluate in Phase 0

Do not create migrations until you have produced and reviewed an ERD/schema proposal. The model will likely need concepts equivalent to:

- tenants/venues, tenant domains, tenant settings/branding, tenant memberships, profiles/roles;
- halls/spaces, operating hours, booking slots/blackouts, availability overrides;
- packages, pricing rules, menu categories/items, decoration themes/options, add-ons;
- customers, bookings, booked spaces, booking line items, quote versions/snapshots, status history;
- payments, payment attempts, refunds/adjustments, invoices/receipts;
- event tasks, assignments, event details, internal notes, uploaded files;
- media assets, notifications, delivery attempts, communication consents;
- optional expenses/suppliers/inventory and audit events.

Choose normalized tables where appropriate; use immutable snapshots for agreed booking/price details. Include indexes, foreign keys, uniqueness constraints, tenant-aware policies, deletion/retention decisions, and a seed-data strategy. Do not put every concern into one oversized bookings table.

## Non-functional requirements

- Security: strong server-side validation, least-privilege access, Supabase RLS, authorization tests, secure storage policies, secret management, rate limiting on public booking/OTP endpoints where appropriate, CSRF/XSS protections consistent with the stack, webhook validation, audit logging, and no sensitive PII in ordinary logs.
- Reliability: database migrations in version control, safe error states, transaction-safe booking confirmation, idempotent webhook/notification handling, recoverable failures, and documented backup/restore considerations.
- Performance: fast public landing page, dynamic import for 3D, compressed responsive media, lazy loading, minimal unnecessary dependencies, no heavy always-running scene if not needed.
- Accessibility: keyboard navigation, focus visibility, labels, contrast, useful alt text, accessible dialogs/forms, and reduced-motion behavior.
- SEO: per-venue metadata and social images; no indexing of private dashboards/customer booking pages.
- Maintainability: typed shared domain models, a clear provider layer, reusable components, readable naming, documented decisions, migrations, seed fixtures, and tests.
- Localization/currency/time zone must be tenant configuration, not hard-coded through UI components.

## Acceptance criteria (high-level)

The solution is not complete just because the homepage looks attractive. Eventually it must prove all of the following:

1. A platform admin can create two demo venues with different branding and configuration, without duplicating the codebase.
2. A customer can choose a genuinely available slot, configure their event, see a correct itemized server-calculated quote, submit a booking, and receive a clear reference/status.
3. Concurrent attempts to book the same unavailable slot cannot both become confirmed.
4. A verified deposit changes the appropriate payment/booking state and records the audit trail; an unverified screenshot does not.
5. Venue staff can progress the booking, finalize the menu/decor details, assign tasks, and view an event sheet.
6. Customers and tenant staff cannot access another tenant's protected records; include negative tests.
7. WhatsApp/email integrations clearly report configured, test, queued, failed, or verified provider states and never fake delivery.
8. All critical forms, navigation, calendar filters, dialogs, and mobile layouts work; no dead buttons.
9. The public site remains functional if WebGL, external stock APIs, or optional messaging/payment integrations are unavailable.
10. Lint, type checks, automated tests, and key Playwright flows pass; setup and deployment steps are documented.

## Token/context and change-management rules

These rules are mandatory:

- **Never implement the entire platform in one pass.** One milestone per instruction.
- For the first run, do not code. Produce requirements and a proposed build plan only.
- Before each milestone, state the goal, assumptions, intended files/areas, and validation plan in a short summary.
- Work only on the approved milestone. Do not silently start the next milestone.
- Read `CLAUDE.md` and the relevant project docs first. Do not repeatedly reread the whole repository unless needed.
- Keep durable project knowledge in `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, and `docs/QA_CHECKLIST.md`. Keep the root `CLAUDE.md` concise; put longer procedures in skills/docs.
- Avoid dumping whole source files into chat. Edit the smallest reasonable set of files and show focused diffs/summaries.
- Do not rewrite stable architecture or install a new dependency without explaining why it is needed.
- Use typed fixtures for designs before backend integration, but label fixtures/demo records clearly. Do not portray mock behavior as real production integration.
- At the end of each milestone, report: changed files, features done, checks actually run and their result, known limitations, credentials still required, and the exact next milestone command.
- Update `docs/ROADMAP.md` and `docs/DECISIONS.md` when status or major technical decisions change.
- If the session/context is getting long, provide a compact handoff summary in `docs/ROADMAP.md`, then stop. I will use `/clear` for the next milestone and ask you to reload the project docs. Use `/compact` only when it is useful to continue the same milestone.
- Never claim a test, deployment, message, payment, or integration succeeded unless you actually verified it.
- Make pragmatic assumptions and record them rather than asking many minor questions. Ask only when a missing decision genuinely blocks safe progress.

## First task — planning only

Inspect the repository and the reference assets. Do **not** implement application code yet. If this is a blank repository, treat it as a new project.

Produce these deliverables:

1. A concise product requirements document separating MVP, later enhancements, and out-of-scope items.
2. User journeys and a role/permission matrix.
3. A sitemap and route map for public website, customer portal, venue dashboard, and platform super admin.
4. A text-based architecture diagram and major component/provider boundaries.
5. An ERD or clear relational schema proposal including tenant boundaries, RLS strategy, indexes, booking conflict handling, and immutable quote/payment records.
6. A visual design brief: palette, typography direction, motion principles, 3D approach, mobile fallback, and reference interpretation.
7. An integrations checklist listing credentials/accounts that will be needed later, without asking me to paste secrets into chat.
8. Milestones with dependencies, estimated complexity (S/M/L), acceptance criteria, and tests per milestone.
9. Top technical/security risks and the decision needed to mitigate each.
10. The proposed contents of `CLAUDE.md` and list of any necessary skills/MCP servers. Do not install anything without approval.

Create/update only planning documentation (for example, the `docs/` files) and do not scaffold or implement application code yet. Keep the response concise and point me to the files. Finish by waiting for my approval. Do not continue automatically.

---

# Section B — Suggested milestone roadmap

Treat these as a starting point. Refine dependencies during Phase 0, then obtain approval before coding.

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Discovery and structure** | Requirements, user journeys, permissions, route map, ERD/RLS strategy, visual brief, risks, integration prerequisites, roadmap. No app code. | Planning documents reviewed and approved. |
| **M1 — Design system and visual prototype** | Tokens, typography, responsive navigation, buttons/forms/tables, home hero, public pages, dashboard shell, fixture data, motion, mobile/reduced-motion fallback. No real payment or WhatsApp. | Main routes feel coherent; key journeys are clickable with clearly labeled demo data; lint/type checks pass. |
| **M2 — Technical foundation and security** | Next.js setup, Supabase config, migrations, auth, tenant memberships, RLS, storage policies, seed two demo venues, base layouts. | Auth works; tenant boundary and negative access tests pass; setup docs work on a fresh environment. |
| **M3 — Venue configuration and catalogues** | Venue settings, halls, schedules/blackouts, packages, pricing rules, menu builder, decorations/add-ons, media manifest and replacement UI. | Admin can configure two demo venues and their public content independently. |
| **M4 — Booking engine and pricing** | Availability, collision-safe booking, temporary holds, quote calculator/snapshots, deposit/balance math, controlled status transitions, secure customer booking view. | Booking/pricing tests pass, including edge cases and concurrent slot attempts. |
| **M5 — Event operations/admin** | Calendar, customer CRM, event detail sheet, stage/timeline, tasks/assignments, menu/decor finalization, notes, CSV reports and audit log. | Staff can operate a booking from inquiry through completion with permissions enforced. |
| **M6 — Notifications and money movement** | Email adapter, WhatsApp Cloud API/provider adapter, opt-in, templates, webhooks/delivery logs, reminders, payment provider adapter, sandbox/manual payment path. | Sandbox/manual flows and webhook idempotency tested; no false success states. Live activation awaits external credentials. |
| **M7 — Media and immersive polish** | Stock-placeholder/media provenance, upload/replace workflow, optimized image/video delivery, 3D/2.5D hero, future panorama/GLB seam, reduced-motion and WebGL fallbacks. | Replacing placeholder media requires no code change; performance/mobile fallbacks pass. |
| **M8 — QA and launch readiness** | End-to-end testing, accessibility, SEO, performance pass, security review, error states, backups, deployment guide, production asset checklist. | Critical journeys pass; issues and limitations are documented; no launch claim until deployment is verified. |

---

# Section C — Minimal recommended tools/skills

Install only what supports the approved architecture. Do not install all of these blindly.

### Core setup

- **Claude Code:** best fit for a multi-file, full-stack application because it can inspect and modify the repository over multiple sessions. Claude chat/artifacts can be useful for an early visual concept, but a working database, auth, webhooks, and deployable application should live in a real repository.
- **Git:** commit after each accepted milestone so you can roll back bad changes.
- **Next.js + TypeScript + Supabase:** suggested baseline, not a restriction if the planning phase finds a strong reason to change it.

### Skills worth adding

Use the skills CLI once per project, if it is compatible with your installed Claude Code version:

```bash
npx skills add anthropics/skills --skill frontend-design
npx skills add supabase/agent-skills --skill supabase
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
```

- `frontend-design`: better design direction, typography, layout decisions, and visual craft.
- `supabase`: current implementation guidance for Supabase Auth, database, storage, RLS, and related tools.
- `supabase-postgres-best-practices`: additional database review guidance.

Do not install overlapping skills that all try to control the same design/code task. Keep skill instructions short and project-specific.

### Optional browser MCP

Add the official Microsoft Playwright MCP when you are ready to test the running UI in a browser. It is useful for screenshot review and automating booking/admin journeys, but it is not required for the initial planning phase. Follow the current installation instructions in the official repository: https://github.com/microsoft/playwright-mcp

### Optional Supabase MCP/plugin

Use Supabase's MCP/plugin only after a Supabase project exists. Prefer a development or staging project and least-privilege credentials. Do not provide unrestricted production-database access to an agent. You can start with Supabase skills and migrations alone, then add live MCP access when it provides clear value.

### Media source

Pexels has a photos/videos API, but API access requires a key and its API guidelines require prominent Pexels attribution/linking. Use a controlled list of stock items with provenance, or bundled placeholder assets; do not scrape websites. See https://www.pexels.com/api/documentation/

---

# Section D — Reusable commands for each session

### Start a fresh milestone session

Use `/clear`, then send:

> Read `CLAUDE.md`, `docs/PROJECT_BRIEF.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. Check the current Git status. Summarize the approved current milestone and its acceptance criteria in no more than 10 bullets. Do not change code yet. Tell me if any required document is missing.

### Execute a milestone

Replace `M1` with the approved milestone ID:

> Execute **only M1** from `docs/ROADMAP.md`. Follow its approved scope and acceptance criteria. First state your brief plan and files/areas to change. Then implement the milestone in the repository, not just as advice. Do not start M2. Run the relevant lint, type checks, tests, and browser checks available. Fix issues you introduce. Update the roadmap and decision docs. End with changed files, checks actually run, results, limitations, and the exact next step. Do not claim checks passed unless you ran them.

### Review before accepting a milestone

> Review the current milestone against its acceptance criteria. Inspect the diff, look for security issues, tenant leaks, accessibility problems, broken mobile states, dead buttons, duplicated logic, and performance regressions. Run focused tests. Do not add new features. Fix only issues introduced in this milestone and report anything still open.

### Keep context/token use low

> Stop after the requested milestone. Do not recap entire files. Give a short handoff summary and update `docs/ROADMAP.md`. I will use `/clear` before the next milestone.

### When credentials are not ready

> Do not block or invent secrets. Implement the provider interface, local/test adapter, environment-variable names, setup instructions, and honest disconnected/pending states. Keep the integration easy to activate once real credentials are available. Never put secrets in client code or commit `.env` files.

---

# Section E — Production launch checklist

Before replacing demo content or taking real bookings, verify:

- [ ] The real venue name, logo, contact details, address/map, terms, cancellation rules, currency, time zone, hall capacities, pricing, packages, menu, decorations, and policies are configured.
- [ ] Every demo/stock image and video is replaced or clearly approved, and media provenance/required attribution is retained.
- [ ] The venue's payment provider account is approved; sandbox/live keys and verified webhooks are configured safely.
- [ ] WhatsApp Business setup, opt-in language, templates, webhook, business phone, and delivery/error logging are verified.
- [ ] Email sender/domain is verified and test emails arrive.
- [ ] Tenant RLS, roles, staff/customer access, booking conflict cases, and payment/status transitions pass tests.
- [ ] Privacy/terms/refund policies are reviewed for the venue's jurisdiction.
- [ ] Backup/restore, logs, error alerts, rate limits, secrets, and database migration procedures are documented.
- [ ] Mobile, tablet, desktop, reduced-motion, keyboard, and WebGL-disabled experiences are tested.
- [ ] Production deployment, domain/DNS, HTTPS, analytics consent where needed, SEO metadata, and monitoring are verified.

**Important:** This project includes money, personal data, and business messaging. A generated codebase is not automatically production-ready. Verify every payment and notification flow in test mode, review access controls, and complete the launch checklist before taking real bookings.
