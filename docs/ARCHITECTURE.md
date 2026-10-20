# Architecture

## Overview

```
 Browser (public site, booking link, dashboard, admin console)
        │  HTTPS, host name picks the tenant site
        ▼
 Next.js app (App Router, TypeScript)
   ├─ app/            routes only: thin pages that call modules
   ├─ modules/        feature modules (below), server logic + UI per feature
   ├─ sections/       public-site sections, one folder each
   ├─ ui/             shared design-system components and tokens
   └─ providers/      adapters for outside services
        │                         │
        ▼                         ▼
 Postgres (Supabase or        Outside services via adapters
 self-hosted) with RLS        payments · bank API · WhatsApp · email
 + object storage             · storage
        ▲
        │
 Job runner (one entry, /api/jobs/run on a cron): hold expiry, reminders,
 morning summary, review requests, follow-ups, campaigns, status polling
```

## Feature modules

Each module lives in `src/modules/<name>/` and owns its server actions, queries, UI pieces, SQL migrations and tests. Other code imports only from `src/modules/<name>/index.ts`. A lint rule blocks imports of a module's internals.

| Module | Owns |
|---|---|
| `tenants` | Tenants, venues, halls, domains, settings, feature switches, templates, setup checklist, pause/export |
| `access` | Users, memberships, roles, permission keys, `can()` checks, deactivation, audit writer |
| `site` | Building the public page from tenant config, theme tokens, section order |
| `catalogue` | Event types, packages, menus, add-ons, stage themes, offers |
| `calendar` | Availability, blocks, date pricing, public date calendar |
| `pricing` | The pricing service and quote snapshots |
| `booking` | Enquiries, holds, state machine, booking tokens, shareable quotes |
| `payments` | Ledger, manual receipts, provider interface, webhook handling, refunds |
| `notifications` | Templates, consent, send queue, delivery states, reminders, morning summary, review requests |
| `marketing` | Campaigns, follow-ups, dates to fill, referrals, anniversaries, caps, results |
| `invites` | Invite pages and RSVP |
| `operations` | Run sheets, duty schedule, enquiry timer |
| `reports` | Charts, exports |
| `media` | Uploads, size variants, manifest, alt text, provenance |

## Provider adapters

`src/providers/<kind>/<vendor>.ts`, each implementing one interface from `src/providers/<kind>/types.ts`. The active vendor per tenant comes from tenant settings.

| Kind | Interface | MVP adapters |
|---|---|---|
| `payments` | `createPayment`, `verifyWebhook`, `getStatus`, `refund` | `manual`, `sandbox` (bank/gateway later) |
| `messaging` | `send`, `parseWebhook` | `whatsapp-cloud`, `email`, `dev-log` |
| `storage` | `put`, `getUrl`, `remove` | `supabase-storage`, `s3-compatible` |
| `auth` | session helpers | `supabase-auth` |

No adapter configured → the feature shows an honest "not connected" state.

## Where to change what

| I want to change… | Go to |
|---|---|
| A price, menu, package, offer, stage theme | Dashboard → Catalogue (no code) |
| A tenant's colours, logo, photos, captions, section order | Admin console → tenant settings (no code) |
| Turn a feature on/off for a tenant | Admin console → Features (no code) |
| Reminder timings, hold length, caps, summary time | Tenant settings (no code) |
| How one public section looks or moves | `src/sections/<section>/` |
| Add a new public section | New folder in `src/sections/` + register in `src/modules/site/sections.ts` |
| How prices are calculated | `src/modules/pricing/` (tests in the same folder) |
| Booking statuses or transitions | `src/modules/booking/state-machine.ts` |
| Who can do what | `src/modules/access/permissions.ts` + migration for new keys (keys and role defaults seeded in `supabase/migrations/20261020000200_access.sql`) |
| A tenant setting field, default or its validation; the setup checklist; new-tenant templates | `src/modules/tenants/settings.ts`, `checklist.ts`; template payload in `supabase/migrations/20261020000500_create_tenant_fn.sql` |
| Which tenant a public host belongs to | `src/modules/tenants/server/resolve.ts`; header set in `src/proxy.ts` (public routes only) |
| The signed-in user, `can()`, `requirePerm()`, audit writes | `src/modules/access/server/` (key rule in SQL `viewer_keys()`, `supabase/migrations/20261020000450_viewer_keys.sql`) |
| Who can read or write a table (RLS) | The module's RLS migration, e.g. `supabase/migrations/20261020000300_rls_tenants.sql`; negative tests in `tests/db/access.rls.test.ts` |
| Connect the bank or a gateway | New file `src/providers/payments/<vendor>.ts` + keys in admin console |
| Change WhatsApp provider | New file in `src/providers/messaging/` |
| Message wording | Templates in Dashboard → Messages (WhatsApp ones need Meta re-approval) |
| A dashboard screen | `src/modules/<feature>/ui/` + route folder in `src/app/dashboard/` (replaces its placeholder from `src/app/dashboard/[section]/page.tsx`) |
| Dashboard menu: which screens exist and the permission each needs | `DASHBOARD_SCREENS` in `src/modules/access/ui/nav.ts` (mirrors the `/dashboard` table in `docs/SITEMAP.md`) |
| Sign-in, MFA (TOTP) and sign-out flow; venue choice | `src/app/login/`, `src/app/mfa/`, `src/app/dashboard/context.ts`; MFA rule in `src/modules/access/server/session.ts` |
| A scheduled job | `src/modules/<feature>/jobs.ts` (registered in the job runner) |
| Database tables of a feature | `supabase/migrations/` file named after the module |

Keep this table current whenever a module is added or moved.

## Tenancy and security

- Host name → tenant lookup for public pages only.
- Signed-in requests: tenant comes from the user's membership; server checks `can(user, tenant, key)`; RLS repeats the check in the database with `auth_has_perm(tenant_id, key)`.
- Super admin is a row in `platform_admins`; RLS allows them across tenants, and every write is audited.
- Customer access uses hashed, expiring tokens; the token resolves to exactly one booking.
- Secrets: per-tenant provider keys encrypted at rest; only the server decrypts.
- Public endpoints rate limited (reserve, receipt upload, RSVP).

## Hosting (decided before launch)

| Option | Setup |
|---|---|
| A: managed | Vercel (app + cron) + Supabase (Postgres, Auth, Storage) + domain per venue |
| B: own VPS | Docker: Next.js + Postgres + storage (S3-compatible) + Caddy for HTTPS; cron container calls the job runner |

Kept portable by: plain SQL migrations, RLS in SQL, adapters for auth and storage, one job runner endpoint, all config in environment variables (`.env.example` lists them).

## Technology

Next.js App Router, React, TypeScript, Tailwind with tokens, shadcn/ui where it fits, Zod on the server, Supabase (Postgres, Auth, Storage), Vitest for unit/integration, Playwright for journeys. Motion: one custom scroll system from the mockup; GSAP only if needed; Three.js only for a later tour, lazy loaded. Versions confirmed from official docs at M1.
