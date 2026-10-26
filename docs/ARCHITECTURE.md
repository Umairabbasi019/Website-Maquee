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

Each module lives in `src/modules/<name>/` and owns its server actions, queries, UI pieces, SQL migrations and tests. Other code imports only from `src/modules/<name>/index.ts`. A lint rule blocks imports of a module's internals. A module whose pure code a client component needs also has `client.ts`, a second public entry that must never import `server-only` code, directly or through another module's `index.ts` (it uses their `client.ts`); `index.ts` stays the server entry. Today: `tenants`, `catalogue`, `media`, `editor`.

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
| How one public section looks or moves (hero, inside, stage, gallery, events, packages, contact, footer; styles are CSS Modules ported from the mockup) | `src/sections/<section>/` |
| Pinned scroll scenes (pin length, frames, how they stack with reduced motion or no JS), shared caption/shade/shot styles | `src/modules/site/ui/site-base.css` (`.pin .sticky .frame .shot .shade`); `usePin` in `src/sections/shared/motion.ts`; `src/sections/shared/Caption.tsx` |
| Hero depth parallax: when it runs (device gate), the WebGL2 layer and shader, depth maps (the server `<img>` stays as fallback and LCP) | Gate `src/sections/hero/depth/shouldUseDepth.ts` (probe and lazy load in `src/sections/hero/HeroMotion.tsx`); layer `depth/DepthLayer.tsx`, shader and strength `depth/shader.ts`; turned on per venue by `content.hero.mode: "depth"`; maps made offline by `tools/depth.py` (model in git-ignored `.tools/depth/`) into the media folder as `e-<key>-depth.png`, uploaded by `scripts/seed-media.ts` |
| Add a new public section | New folder in `src/sections/` + register its key in `SECTION_COMPONENTS` in `src/modules/site/sections.ts` (and add the key to the section list in `src/modules/tenants/settings.ts`) |
| Scroll motion and shared section helpers: pin/reveal/smoothing, `Shot` with `srcSet`/`coverSizes`, run-after-idle for `Intl` work | `src/sections/shared/` (`motion.ts`, `image.ts`, `Shot.tsx`, `useAfterIdle.ts`; `format.ts`, `hours.ts`, `enquiry.ts` for text helpers) |
| Which off-screen sections the browser skips laying out (`content-visibility`, unpinned sections only) and their first-visit height guesses | `src/modules/site/ui/site-base.css` (the `#gallery #packages #contact #footer` rules); never add a pinned section |
| What a "Check a date" or "Choose <package>" click carries into the enquiry (event, package, guests) | `src/sections/shared/enquiry-state.tsx` (`EnquiryProvider`, `useEnquiry`; provider wraps sections in `src/modules/site/ui/SiteShell.tsx`) |
| How prices are calculated | `src/modules/pricing/` (tests in the same folder) |
| Booking statuses or transitions | `src/modules/booking/state-machine.ts` |
| Who can do what | `src/modules/access/permissions.ts` + migration for new keys (keys and role defaults seeded in `supabase/migrations/20261020000200_access.sql`) |
| Venue copy and site content (hero, captions, event text, contact, `sample` flag): the `content` block of `tenant_settings` | `SiteContentSchema` in `src/modules/tenants/settings.ts`; Manor and demo content in `scripts/seed-data/manor.ts`, `demo.ts`, written by `scripts/seed-site.ts`; column added in `supabase/migrations/20261022000100_site_content.sql` |
| A tenant setting field, default or its validation; the setup checklist; new-tenant templates | `src/modules/tenants/settings.ts`, `checklist.ts`; the "Standard marquee" template payload in `supabase/seed.sql`; creation function in `supabase/migrations/20261020000500_create_tenant_fn.sql` (fixed in `20261020000510_create_tenant_fn_fix.sql`) |
| Which tenant a public host belongs to; its primary (canonical) host | `src/modules/tenants/server/resolve.ts` (`resolveTenantByHost`, `getPrimaryHost` from `tenant_domains.is_primary`, `supabase/migrations/20261025000200_primary_domain.sql`); header set in `src/proxy.ts` (public routes only) |
| The signed-in user, `can()`, `requirePerm()`, audit writes; session refresh (`refreshSession`, called from `src/proxy.ts` on signed-in routes) | `src/modules/access/server/` (key rule in SQL `viewer_keys()`, `supabase/migrations/20261020000450_viewer_keys.sql`) |
| Event types, packages, offers, add-ons and stage themes (tables, row schemas, public read for the site, `hasSample` flag; sample seed data) | `src/modules/catalogue/schemas.ts` (row checks, mirror the table constraints), `src/modules/catalogue/server/public.ts`; `supabase/migrations/20261022000200_catalogue.sql`, `20261026000200_catalogue_m3.sql`; seed in `scripts/seed-site.ts` and `scripts/seed-data/` |
| Date prices (seasonal or date-range price rules, all events or one event type; overlap refused per scope by an exclusion constraint; `listDatePrices`, `saveDatePrice`, `deleteDatePrice`, `DatePriceSchema`) | `src/modules/calendar/date-prices.ts` (schema), `src/modules/calendar/server/date-prices.ts`; `supabase/migrations/20261026000400_date_prices.sql` |
| Venue photos (public bucket `venue-media`, written only by the service role; `media_assets` table with each size's pixel `dims`, public URLs and widths for the site; any upload path must write `dims`; demo images) | `src/modules/media/server/assets.ts`; `supabase/migrations/20261022000300_media.sql`, `20261023000100_media_dims.sql`, `20261025000100_media_key_ext.sql` (key and ext formats); seed in `scripts/seed-media.ts` (reads image sizes) and `scripts/seed-data/media-manifest.ts`; demo images made by `tools/make_demo_images.py` |
| Media library and uploads: size plan (s/m/l = 1280/1920/2880 px on the long side, never upscaled, next size only when the photo is longer than the previous target), new keys from the file name, Storage paths (`<tenant_id>/<key>/<size>.<ext>`, depth always `depth.png`, overwritten on a new map, its URL carrying `?v=<dims.depthVersion>` so caches fetch the new one, every write and delete through `objectPath`), upload checks (15 MB, magic bytes then sharp header: JPEG/PNG/WebP only, 40 MP, no animation; PNG kept only with transparency, else JPEG q82 mozjpeg; EXIF rotated then stripped), categories (hero/logo/seo need `tenant.settings.edit`), alt text, delete only when unused (published site or draft), depth maps (`tenant.settings.edit`, PNG, shape within 1 % of the photo), the picker | `src/modules/media/variants.ts` (plan, key, path), `src/modules/media/server/library.ts` (checks, upload, replace, alt, delete, depth; audit `media.*`), depth URL in `server/assets.ts`, `src/modules/media/ui/UploadForm.tsx` and `ui/MediaPicker.tsx`; the screen `src/app/dashboard/media/` (`page.tsx`, `media-grid.tsx`, `actions.ts`; `usage.ts` asks the editor where a photo is used). Replace rule: a new asset with the old alt text and category, then the action saves `swapMedia` in the draft (only when the draft uses the old key; a refused swap deletes the new asset); the old photo stays until it is unused and deleted. The media module never imports the editor (the editor imports media). Body limits in `next.config.ts` (`serverActions.bodySizeLimit`, `proxyClientMaxBodySize`) |
| The public site: loading a venue's view, theme, fonts, SEO and JSON-LD, shell (nav, overlays, preview bar), page wiring | `src/modules/site/` (`server/load.ts`, `theme.ts`, `fonts.ts`, `seo.ts`, `ui/SiteShell.tsx`); `src/app/page.tsx` (renders the site; also the paused-tenant holding notice and the platform-host 404); shared section types in `src/sections/types.ts`; motion, and `Shot` with its `srcset`/`sizes` helpers (`image.ts`) in `src/sections/shared/` |
| The site editor's draft: its shape, what one save may change (slug rules, removing an event, swapping a photo), which keys a change needs (TS mirror of the SQL permission triggers), publish checks, where a photo is used, what is still sample; saving, publishing and discarding the draft | `src/modules/editor/` (`draft.ts`, `changes.ts`, `keys.ts`, `check.ts`, `media-usage.ts`, `blocked.ts` names the items a viewer may not publish; `server/draft.ts` reads and saves the draft (optimistic revision, server ids for new rows, key check per save), `server/publish.ts`, `server/view.ts` the draft as a `SiteView`); the Server Actions in `src/app/dashboard/site/actions.ts`; draft writes go through `save_site_draft()` (`supabase/migrations/20261026000600_save_site_draft.sql`); the key table is tested against `tests/fixtures/field-permissions.ts`, as the SQL triggers are; rupee input parsing in `parseRupees` (`src/sections/shared/format.ts`); the draft table and Publish in SQL (`site_drafts`, `site_snapshot()`, `site_diff()`, atomic audited `publish_site()`) in `supabase/migrations/20261026000500_site_drafts.sql` |
| Who can read or write a table (RLS) | The module's RLS migration, e.g. `supabase/migrations/20261020000300_rls_tenants.sql`; negative tests in `tests/db/access.rls.test.ts` |
| Connect the bank or a gateway | New file `src/providers/payments/<vendor>.ts` + keys in admin console |
| Change WhatsApp provider | New file in `src/providers/messaging/` |
| Message wording | Templates in Dashboard → Messages (WhatsApp ones need Meta re-approval) |
| The on-page editor screen: editor bar (change count, still-sample list, Laptop/Phone, Discard, Publish with the rendered revision, a menu of venue info and super-admin panels as `data-edit-menu` markers, "Content is real"), ✎ buttons on `data-edit` markers (who sees which ✎: `targets.ts`), side panels for packages, events, offers, add-ons and stage themes (rupee inputs, inline Zod messages, read-only fields with a reason), venue info (phones, hours, address, manager card), gallery tiles, section copy (a form built from the value's shape), theme, section order and venue details, the hero depth-map offer, the phone preview | `src/modules/editor/ui/` (`EditorBar.tsx`, `EditOverlay.tsx` maps targets to panels, `Panel.tsx`, `RowPanel.tsx`, `SettingsPanel.tsx` saves settings values, `FieldsForm.tsx`, `fields.tsx`, `panels/`), fonts offered from `FONT_NAMES` (`src/modules/site/theme.ts`), the depth upload action `uploadDepthMap` in `src/app/dashboard/media/actions.ts`, `src/modules/editor/targets.ts`; routes `src/app/dashboard/site/page.tsx` and `src/app/site-preview/page.tsx` (noindex, editors only, session route in `src/proxy.ts`); markers from `editAttrs` in `src/sections/shared/edit.ts`; the shared motion loop runs only with `html.js` (`src/sections/shared/motion.ts`), so the edit canvas stays plain blocks |
| A dashboard screen | `src/modules/<feature>/ui/` + route folder in `src/app/dashboard/` (replaces its placeholder from `src/app/dashboard/[section]/page.tsx`) |
| Dashboard menu: which screens exist and the permission each needs | `DASHBOARD_SCREENS` in `src/modules/access/ui/nav.ts` (mirrors the `/dashboard` table in `docs/SITEMAP.md`) |
| Sign-in, MFA (TOTP) and sign-out flow; venue choice | `src/app/login/`, `src/app/mfa/`, `src/app/dashboard/context.ts`; MFA rule in `src/modules/access/server/session.ts` |
| Super admin console screens and actions (tenant list, create, status, features, limits, secrets) | `src/app/admin/` (host + MFA gate in `guard.ts`); data and writes in `src/modules/tenants/server/admin.ts`; limit check in SQL `set_tenant_limits()` (`supabase/migrations/20261021000100_set_tenant_limits.sql`) |
| Banner telling the super admin which tenant the dashboard shows; "Open dashboard" (`/dashboard?tenant=<id>` turned into the venue cookie) | `src/modules/tenants/ui/TenantBanner.tsx`, used in `src/app/dashboard/layout.tsx`; query handling in `src/proxy.ts`, cookie in `src/app/dashboard/venue-cookie.ts` |
| Noindex for private, setup or sample venues (`robots` on the public page) | `siteMetadata` in `src/modules/site/seo.ts`: setup status, `content.sample` or `catalogue.hasSample` turns indexing off; paused tenants in `generateMetadata` in `src/app/page.tsx` |
| Login and manager limits per venue | Enforced by the trigger in `supabase/migrations/20261020000400_login_limits.sql`; super admin changes them through `set_tenant_limits()` in `supabase/migrations/20261021000100_set_tenant_limits.sql`; range check in `supabase/migrations/20261021000300_tenant_limit_checks.sql` |
| Tenant secrets (payment, WhatsApp, email keys) | Encrypt and decrypt in `src/modules/tenants/server/secrets.ts`; table locked to the server by `supabase/migrations/20261020000600_tenant_secrets_lockdown.sql` |
| Owner protection (who can touch owner memberships) | `supabase/migrations/20261020000700_owner_protection.sql`; tests in `tests/db/owner-protection.test.ts` |
| Custom tenant roles (super admin only until M6) | Write policies in `supabase/migrations/20261021000200_custom_roles_admin_only.sql` |
| Local demo data | `supabase/seed.sql` (tenants, template) and `scripts/seed-users.ts` (auth users, memberships); run `npm run db:seed` |
| Which modules the import-boundary lint rule covers; the allowed `client.ts` entry | `modules` list and the `!@/modules/*/client` pattern in `eslint.config.mjs`; add a name there when a module is created |
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
