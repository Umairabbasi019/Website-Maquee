# M3 Venue Editing and Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A venue manager edits prices, menus, packages, offers, add-ons, stage themes, contact details, hours and gallery photos on a live-looking copy of their site, presses Publish, and the public site changes in one audited step; the super admin edits everything else for any venue through the same editor and a plain settings screen.

**Architecture:** One shared JSON draft per venue (`site_drafts`, written only by the server after `can()` and Zod) holds a full snapshot of what the site reads. Publish is one SQL function, `publish_site`, run with the caller's own session: it deletes the draft row (the lock that makes concurrent publishes safe), applies only the changed rows and parts, and writes one audit event with a diff. Permissions are enforced three times: `can()` in server actions, RLS on every table, and SQL triggers that require a key per changed column or settings field (`prices.edit` on price columns, `venue.info.edit` on contact fields, `tenant.settings.edit` on everything super-admin-only). Catalogue and settings tables refuse direct client writes outside `publish_site`, so every live change goes through draft and Publish. The editor renders the real sections from the draft with `data-edit` markers and a client overlay that adds ✎ buttons; the public route never imports editor code.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents: true`, Server Actions), React 19.3, Supabase local (Postgres, Storage), Zod 4.6.7, `sharp` (new direct dependency, user-approved 2026-10-26), Postgres `btree_gist` extension (built in), Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-26-m3-venue-editing-design.md` (read it before any task). Approved editor look: `.superpowers/brainstorm/1962-1793003285/content/edit-style.html` (mockup B). Background: M2 plan `docs/superpowers/plans/2026-10-21-m2-public-site.md`, `docs/ARCHITECTURE.md`, `docs/JOURNEYS.md` (permission matrix).

## Global Constraints

- Branch `feat/m3-venue-editing`; never commit to `main`. Every commit message ends with `Co-authored-by: Umair Abbasi <umairabbasi.019@gmail.com>`; no Claude/Anthropic credit.
- Only new dependency: `sharp` (pin the version already in `package-lock.json`). Ask before any other.
- Tenant ID comes only from `getDashboard()` (venue cookie checked against memberships) or `src/proxy.ts` headers, never from a form field, URL or request body.
- Every new table: RLS on, policies for `authenticated` only, negative tests (anon, other tenant, staff, accounts, a manager lacking the key).
- Money: integer paisa in the database and in the draft. Forms take rupees (`3,200` or `3200.50`) and convert with `parseRupees` (string maths, no floats).
- Draft payload keys are camelCase; table columns are snake_case. `site_snapshot()` is the only place that maps between them in SQL; `SiteDraftSchema` is its TS twin.
- Settings written from the editor are parsed with the same schemas the site reads (`IdentitySchema`, `ThemeSchema`, `SectionsSchema`, `MessagingSchema`, `SiteContentSchema`; https-only URLs). Nothing that fails them reaches `tenant_settings`.
- Editor code lives in `src/modules/editor/` and `src/app/dashboard/site/`; `src/app/page.tsx` and `src/modules/site/` must not import it. Sections emit `data-edit` attributes only when `site.editing` is true, so public HTML is unchanged.
- Import other modules only through their `index.ts`; add `editor` and `calendar` to `modules` in `eslint.config.mjs`. Update the "Where to change what" table in `docs/ARCHITECTURE.md` in the task that changes a module.
- All platform UI strings through `t()` in `src/ui/i18n/en.ts`. Editor is laptop-first and must work at 375 px (panels full width, every ✎ a labelled `<button>`, focus returns to it when a panel closes, Escape closes).
- No fake states: Publish shows success only after `publish_site` returned; a button for something not built is hidden.
- Report only checks actually run. Baseline before Task 1: unit 116, db 105, e2e 42 passing. Run `npm run db:seed` before db and e2e tests.

## Decisions taken in this plan (spec §7 "left to the builder")

- **Draft storage:** one JSON row per venue in `site_drafts`; the whole snapshot, not a patch list. Saves use optimistic `revision` checks with up to 3 retries. Publish and Discard take the `revision` the person saw; a mismatch returns "The site changed, review and publish again".
- **Who may publish:** whoever holds the key for every change in the draft, including other people's changes (enforced by the triggers during `publish_site`; a TS pre-check names the blocked items first).
- **Small editors:** a right-side panel (420 px on laptop, full screen below 640 px), not popovers.
- **Stage themes and add-ons on the public site:** one "Extras" row under the package cards in the Packages section, styled like the existing offer cards, shown only when active rows exist. No stage-theme preview page (M8).
- **Date prices:** saved directly from the settings screen (the site does not show them in M3). Overlap rule: two date prices for the same scope (same event type, or both "all events") may not overlap; an event-specific range may overlap an all-events range, and M4 applies the event-specific one. Enforced by an exclusion constraint.
- **Direct writes and audit (M1 carry-over):** catalogue tables and `tenant_settings` refuse client writes outside `publish_site`; `halls`, `slots`, `date_prices` accept client writes (settings screen) and a trigger audits each one; `media_assets` loses its client write policy (server-only writes, explicit audit), like its bucket.
- **What saves directly vs through Publish:** draft + Publish for everything in `tenant_settings` except `money_rules` and `limits`, and for all catalogue rows. Direct save (audited): halls, slots, date prices, money rules. Slot names appear in the enquiry form, so a slot change is live at once; state that on the settings screen.
- **`content.packages.defaultEvent`** counts as catalogue (`catalogue.edit`), so removing an event type can clear it.
- **New packages need `prices.edit`** (a package must have a price). Prices alone (`prices.edit` without `catalogue.edit`) may still be changed.
- **Uploads:** through a Server Action with a 15 MB limit; sizes s 1280, m 1920, l 2880 px long side, never upscaled. `shortcut: the file passes through the server request; Vercel caps bodies at 4.5 MB, switch to signed direct uploads to Storage before deploying there.`
- **Replace photo** = upload a new asset (new key, so cached URLs never show the wrong picture) and swap every draft reference from the old key; the old one can be deleted once unused.
- **Public cache:** the public page renders per request with no cross-request cache, so Publish has nothing to refresh; an e2e test proves the change shows on the next load. If caching is added later, Publish must revalidate.
- **Not in M3:** audit log screen (M6), `tenant_domains.is_primary` UI (stays SQL), undo of a single change, scheduled publishing.

## Review Focus

1. Two people save the same venue's draft at once (one edits a price, the other an offer) → both changes survive and the change count shows two (db test in Task 8).
2. Rupee input typed the way people type it: `Rs 3,200`, ` 3200 `, `3200.5`, `3,200.50` accepted; `-5`, `1e3`, `3.333`, `0`, `٣٢٠٠`, empty refused with a message (unit test in Task 5).
3. Manager removes the event type that is `packages.defaultEvent` and still has packages → its packages leave the draft, `defaultEvent` is cleared, Publish works, the site shows the remaining tabs (unit test in Task 5, db test in Task 6).
4. Upload of a HEIC file, a text file renamed `.jpg`, a 20 000 × 20 000 PNG, an animated WebP, a PNG with transparency → the first four refused with a clear message, the last stored as PNG (unit tests in Task 9).
5. A key is taken away after the draft was made (super admin revokes `prices.edit` from the manager who changed a price) → that manager's Publish is refused with a message naming the item, the draft is kept, nothing goes live (db test in Task 6).

---

### Task 1: Dashboard guard, `venue.info.edit` key, nav

**Files:**
- Create: `supabase/migrations/20261026000100_venue_info_key.sql`
- Modify: `src/proxy.ts`, `src/modules/access/permissions.ts`, `src/modules/access/ui/nav.ts`, `src/ui/i18n/en.ts`, `docs/JOURNEYS.md` (matrix row), `docs/SITEMAP.md` (`/dashboard/site`, drop `/dashboard/catalogue/*`)
- Test: `tests/unit/proxy.test.ts`, `tests/unit/nav.test.ts`, `tests/db/access.rls.test.ts`

**Interfaces:**
- Produces (SQL): permission `venue.info.edit` ("Phones, opening hours, address, manager card"), granted by default to built-in `owner` and `manager`.
- Produces (TS): `PERMISSIONS` includes `"venue.info.edit"`. `DASHBOARD_SCREENS[i].perm: PermissionKey | readonly PermissionKey[]` (array = any of). New screen `{ href: "/dashboard/site", labelKey: "nav.site", perm: ["catalogue.edit", "prices.edit", "venue.info.edit", "tenant.settings.edit"] }` placed before media; `/dashboard/catalogue` removed; settings becomes `["tenant.settings.edit", "calendar.manage", "prices.edit"]`. `can()` unchanged; `dashboardNav` and `[section]/page.tsx` accept either form via a local `canAny(viewer, tenantId, perm)` in `nav.ts`, exported from the access index.

- [ ] **Step 1: Write the failing tests.** `proxy.test.ts`: `/dashboard?tenant=<uuid>` with header `sec-fetch-site: cross-site` sets no venue cookie and is not redirected; with `same-origin` and with `none` it redirects and sets the cookie; with no header it is refused like cross-site. `nav.test.ts`: a manager sees "Edit site" and "Settings"; staff sees neither; a viewer holding only `venue.info.edit` sees "Edit site". `access.rls.test.ts`: built-in manager and owner roles hold `venue.info.edit`, accounts and staff do not.
- [ ] **Step 2:** Run `npm test -- proxy nav` and `npm run test:db -- access`. Expected: FAIL.
- [ ] **Step 3:** Implement: proxy honours `?tenant=` only when `sec-fetch-site` is `same-origin` or `none`; otherwise strips the query and continues (redirect to the clean URL without setting the cookie). Migration, `PERMISSIONS`, nav change, `canAny`, label `nav.site: "Edit site"`, docs rows.
- [ ] **Step 4:** Run `npm run db:seed && npm test && npm run test:db && npm run lint && npm run typecheck`. Expected: PASS. Commit `feat(access): add venue.info.edit, edit-site nav and guard the dashboard tenant query`.

### Task 2: Catalogue tables, column permissions, publish-only writes

**Files:**
- Create: `supabase/migrations/20261026000200_catalogue_m3.sql`, `tests/fixtures/field-permissions.ts`
- Modify: `tests/db/catalogue.rls.test.ts`
- Test: `tests/db/catalogue.rls.test.ts`, `tests/db/column-perms.test.ts`

**Interfaces:**
- Produces (SQL):
  - `addons (id uuid pk, tenant_id, name text not null, price_paisa int not null check > 0, basis text not null check in ('flat','per_guest'), active bool default true, sort int default 0, sample bool default false)`.
  - `stage_themes (id, tenant_id, name, description text default '', price_paisa int not null check > 0, media_keys text[] not null default '{}', active bool default true, sort int default 0, sample bool default false)`.
  - `offers` gains `discount_kind text null check in ('percent','fixed')`, `discount_value int null`, `starts_on date null`, `ends_on date null`; checks: kind and value both null or both set; percent 1–100; fixed > 0 (paisa); `ends_on >= starts_on` when both set.
  - `check_column_perms()` trigger function. `TG_ARGV[0]` = base key; further args `'<key>:<column>'`. For client roles (`current_setting('role') in ('authenticated','anon')`, platform admins pass): INSERT and DELETE need the base key, and INSERT also needs each pair key whose column is not null; UPDATE needs the base key if any column outside the pairs changed, and each pair key whose column changed. Raises `42501` with message `needs <key>`. Attached: `event_types ('catalogue.edit', 'tenant.settings.edit:media_key')`, `packages ('catalogue.edit', 'prices.edit:price_per_guest_paisa')`, `offers ('catalogue.edit', 'prices.edit:discount_kind', 'prices.edit:discount_value')`, `addons ('catalogue.edit', 'prices.edit:price_paisa')`, `stage_themes ('catalogue.edit', 'prices.edit:price_paisa')`.
  - `require_publishing()` trigger function: client-role writes raise `42501` `edit through the site editor` unless `current_setting('app.publishing', true) = 'on'` (set only inside `publish_site`; PostgREST cannot set it). Attached to the five catalogue tables. Comment the limit and the upgrade path (SECURITY DEFINER writes) on the function.
  - RLS: read `bookings.view` (new tables too). Write policies replaced by: insert/delete `catalogue.edit`; update `catalogue.edit or prices.edit` (event_types update also `tenant.settings.edit`); the trigger narrows per column.
- Produces (TS test fixture): `FIELD_PERMISSIONS: { part: "events"|"packages"|"offers"|"addons"|"stageThemes"|"identity"|"content"|"theme"|"sections"|"messaging"; field: string /* draft path, dot-separated */; column?: string /* SQL column for catalogue parts */; key: PermissionKey }[]` with every row of the tables above (Task 3 adds the settings rows). Task 5 tests the TS mirror against it.

- [ ] **Step 1: Write the failing tests.** `column-perms.test.ts`, for each catalogue row of `FIELD_PERMISSIONS`, inside `select set_config('app.publishing','on',true)`: a Manor-like manager whose membership has an override revoking `key` cannot change that column (`needs <key>`), and can after the override is removed. Also: without `app.publishing` a manager's insert into `packages` fails with `edit through the site editor`; a manager without `prices.edit` can rename a package but cannot insert one; a manager with only `prices.edit` (override revoking `catalogue.edit`) can change a price but not the name; a manager of tenant A cannot update B's `addons` row (0 rows). `catalogue.rls.test.ts` (update the old "writes need catalogue.edit" case to set `app.publishing`): anon and other-tenant read 0 rows of `addons`, `stage_themes`; staff (no `bookings.view`) reads 0; offer with `discount_kind 'percent', discount_value 101` fails; `ends_on < starts_on` fails.
- [ ] **Step 2:** Run `npm run test:db -- catalogue column-perms`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and the fixture.
- [ ] **Step 4:** Run `npm run db:seed && npm run test:db`. Expected: all PASS (seed writes use the service role, which the triggers trust). Commit `feat(catalogue): add add-ons, stage themes, offer discounts and per-column price permission`.

### Task 3: Settings field permissions, hall hire price, audited direct writes

**Files:**
- Create: `supabase/migrations/20261026000300_settings_m3.sql`
- Modify: `tests/fixtures/field-permissions.ts`, `tests/db/media.rls.test.ts`, `tests/db/access.rls.test.ts`
- Test: `tests/db/settings-perms.test.ts`, `tests/db/direct-api.test.ts`

**Interfaces:**
- Produces (SQL):
  - `tenant_settings` read and update policies: `auth_has_perm` of any of `tenant.settings.edit`, `venue.info.edit`, `catalogue.edit`. `require_publishing()` attached (BEFORE UPDATE).
  - `check_settings_write()` BEFORE UPDATE trigger, client roles only. Field → key: `identity.phones`, `identity.address`, `identity.openingHours`, `content.contact.manager` → `venue.info.edit`; `content.gallery.tiles`, `content.packages.defaultEvent` → `catalogue.edit`; any other change in `identity`, `content`, `theme`, `sections`, `messaging`, `money_rules`, `limits` → `tenant.settings.edit`. Implementation: strip the listed paths (`#-`) from old and new and compare the rest; compare each listed path on its own. Raises `42501` `needs <key>`.
  - `halls.hire_price_paisa int null check (> 0)`. Halls RLS: insert/delete `tenant.settings.edit`; update `tenant.settings.edit or prices.edit`; `check_column_perms('tenant.settings.edit', 'prices.edit:hire_price_paisa')`.
  - `audit_client_write()` AFTER trigger on `halls`, `slots` (and `date_prices` in Task 4): for client roles, `record_audit(tenant_id, '<table>.<insert|update|delete>', '<table>', id, to_jsonb(old), to_jsonb(new), null)`.
  - `media_assets`: drop `media_assets_write`; reads unchanged.
- Fixture rows added for the settings fields above, plus `theme.colors.primary`, `sections`, `identity.name`, `messaging.whatsappNumber`, `content.hero`, `content.sample` → `tenant.settings.edit`.

- [ ] **Step 1: Write the failing tests.** `settings-perms.test.ts`, for each settings row of `FIELD_PERMISSIONS` (with `app.publishing` on): a manager lacking `key` cannot change the field, one holding it can; a manager changing phones and theme together is refused. Without `app.publishing`, a manager's `update tenant_settings set identity = identity` fails with `edit through the site editor`. A manager with `prices.edit` updates `hire_price_paisa` but not `capacity_max`; that update writes one `audit_events` row `halls.update` with before/after. Accounts and staff read 0 `tenant_settings` rows. `media.rls.test.ts`: a manager insert into `media_assets` fails (no write policy). `direct-api.test.ts` (PostgREST, signs in `manager1@manor.test` with `SEED_USER_PASSWORD`, skipped when `SKIP_SEED_TESTS=1`): `update tenant_settings set money_rules`, `theme`, `sections`, `identity.name` each change 0 rows or error; `update packages set price_per_guest_paisa` errors; reading demo-hall's `tenant_settings` returns 0 rows.
- [ ] **Step 2:** Run `npm run test:db -- settings-perms direct-api media`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and fixture rows.
- [ ] **Step 4:** Run `npm run db:seed && npm run test:db`. Expected: PASS. Commit `feat(tenants): field-level settings permissions, hall hire price and audited direct writes`.

### Task 4: Calendar module, date prices

**Files:**
- Create: `supabase/migrations/20261026000400_date_prices.sql`, `src/modules/calendar/index.ts`, `src/modules/calendar/date-prices.ts`, `src/modules/calendar/server/date-prices.ts`
- Modify: `eslint.config.mjs` (`calendar`), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (overlap rule)
- Test: `tests/db/date-prices.test.ts`, `tests/unit/date-prices.test.ts`

**Interfaces:**
- Produces (SQL): `create extension if not exists btree_gist with schema extensions`; `date_prices (id, tenant_id, starts_on date not null, ends_on date not null check (ends_on >= starts_on), event_type_id uuid null, kind text check in ('percent','per_guest'), value int not null check (value <> 0), label text not null check (length between 1 and 60), foreign key (tenant_id, event_type_id) references event_types (tenant_id, id) on delete cascade, exclude using gist (tenant_id with =, coalesce(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid) with =, daterange(starts_on, ends_on, '[]') with &&))`; percent value between -90 and 300. RLS read `bookings.view`, write `calendar.manage`; `audit_client_write` attached.
- Produces (TS, `@/modules/calendar`): `DatePriceSchema` (Zod: `{ id?: uuid; startsOn: "YYYY-MM-DD"; endsOn; eventTypeId: uuid | null; kind: "percent" | "per_guest"; value: int ≠ 0 (percent −90..300, per_guest paisa); label: 1–60 chars }`, refine `endsOn >= startsOn`); `type DatePrice`; `listDatePrices(tenantId): Promise<DatePrice[]>`, `saveDatePrice(tenantId, input: DatePrice): Promise<{ ok: true } | { error: "overlap" | "invalid" }>`, `deleteDatePrice(tenantId, id): Promise<void>`. Server functions call `requirePerm(tenantId, "calendar.manage")` and use `createServerClient()` (RLS + audit trigger apply). Overlap = Postgres `23P01` mapped to `"overlap"`. M4 imports these through the index.

- [ ] **Step 1: Write the failing tests.** Unit: schema accepts a one-day range and a percent of −10; refuses `endsOn` before `startsOn`, value 0, percent 400, label of 61 chars. DB: two all-events ranges 2026-12-01..10 and 2026-12-10..15 → second fails (exclusion); same dates with one scoped to Barat → both succeed; Barat ranges overlapping → fail; accounts cannot insert; anon and other tenant read 0; manager insert writes an audit row `date_prices.insert`; deleting the event type deletes its date prices.
- [ ] **Step 2:** Run `npm test -- date-prices && npm run test:db -- date-prices`. Expected: FAIL.
- [ ] **Step 3:** Implement migration, schema and server functions; ARCHITECTURE row; DECISIONS entry for the overlap rule.
- [ ] **Step 4:** Run tests, lint, typecheck. Expected: PASS. Commit `feat(calendar): add date prices with overlap rule`.

### Task 5: Draft shape and pure editor logic

**Files:**
- Create: `src/modules/editor/index.ts`, `src/modules/editor/draft.ts`, `src/modules/editor/changes.ts`, `src/modules/editor/keys.ts`, `src/modules/editor/check.ts`, `src/modules/editor/media-usage.ts`; `src/modules/catalogue/schemas.ts`
- Modify: `src/modules/catalogue/index.ts`, `src/sections/shared/format.ts` (`parseRupees`), `eslint.config.mjs` (`editor`)
- Test: `tests/unit/editor-draft.test.ts`, `tests/unit/editor-keys.test.ts`, `tests/unit/site-helpers.test.ts`

**Interfaces:**
- Produces (`@/modules/catalogue`): Zod `EventTypeRowSchema { id: uuid; slug: Slug; name: 1–60; description: ≤ 400; mediaKey: string | null; sort: int; sample: bool }`, `PackageRowSchema { id; eventTypeId: uuid; name: 1–40; pricePerGuestPaisa: int > 0; minGuests: int > 0; items: 1–30 strings of 1–80; featured: bool; sort; sample }`, `OfferRowSchema { id; title: 1–60; body: 1–200; active; sort; sample; discountKind: "percent"|"fixed"|null; discountValue: int|null; startsOn: date|null; endsOn: date|null }` (same checks as SQL), `AddonRowSchema { id; name: 1–60; pricePaisa: int > 0; basis: "flat"|"per_guest"; active; sort; sample }`, `StageThemeRowSchema { id; name: 1–60; description: ≤ 300; pricePaisa: int > 0; mediaKeys: string[] ≤ 8; active; sort; sample }`.
- Produces (`@/sections/shared/format`): `parseRupees(input: string): number | null` → paisa. Strips `Rs`, spaces and thousands commas; ASCII digits only; at most 2 decimals; > 0; ≤ 100 000 000 rupees.
- Produces (`@/modules/editor`):
  - `SiteDraftSchema = z.object({ identity: IdentitySchema, theme: ThemeSchema, sections: SectionsSchema, messaging: MessagingSchema, content: SiteContentSchema, events: EventTypeRow[], packages: PackageRow[], offers: OfferRow[], addons: AddonRow[], stageThemes: StageThemeRow[] })`, `type SiteDraft`. Same shape `site_snapshot()` returns (Task 6).
  - `type DraftChange = { kind: "event"|"package"|"offer"|"addon"|"stageTheme"; id: string; value: <Row without id> | null } | { kind: "settings"; part: "identity"|"theme"|"sections"|"messaging"|"content"; path: string[]; value: unknown } | { kind: "swapMedia"; from: string; to: string }` (`null` = remove; new rows get an id from the server, `crypto.randomUUID()`). `DraftChangeSchema` is its Zod parser (row values parsed with the Task 5 row schemas minus `id` and `sample`; settings `path` 1–4 segments of `[A-Za-z0-9]+`).
  - `applyChange(draft: SiteDraft, change: DraftChange): SiteDraft` — pure. Edited catalogue rows get `sample: false`. Event `slug` is fixed after create (new events get `slugify(name)`, made unique with `-2`, `-3`). Removing an event removes its packages and clears `content.packages.defaultEvent` when it named that event. `swapMedia` replaces every reference (content media refs, `gallery.tiles[].key`, `theme.logo`, `seo.image`, `events[].mediaKey`, `stageThemes[].mediaKeys`). Settings `path` must exist in the current value (no new keys). Throws `DraftError(code)` on unknown ids.
  - `itemKey(change): string` — `package:<id>`, `event:<id>`, …, `settings:<part>.<path joined with ".">` (path cut at depth 2), `media:<from>`; used for "who changed it" and the change count.
  - `requiredKeys(before: SiteDraft, after: SiteDraft): Set<PermissionKey>` — the TS mirror of the Task 2/3 triggers, by the same field table.
  - `checkDraft(draft: SiteDraft, media: Record<string, { alt: string; sizes: string[] }>): DraftIssue[]` with `DraftIssue = { item: string; code: "minGuestsAboveForm" | "missingMedia" | "missingAlt" | "packageWithoutEvent" | "depthMissing" }`. `depthMissing` is a warning only (hero mode `depth` and a hero ref without a depth size); the rest block Publish.
  - `mediaUsage(draft: SiteDraft): Map<string, string[]>` (key → item labels such as `"Gallery"`, `"Barat background"`, `"Stage theme: Royal"`) and `sampleReport(draft: SiteDraft): { packages: number; offers: number; events: number; addons: number; stageThemes: number; content: boolean }`.

- [ ] **Step 1: Write the failing tests.** `site-helpers.test.ts` adds the Review Focus 2 cases (`parseRupees("Rs 3,200") === 320000`, `("3200.5") === 320050`, `("3,200.50") === 320050`, `(" 3200 ") === 320000`; `-5`, `1e3`, `3.333`, `0`, `٣٢٠٠`, `""` → `null`). `editor-keys.test.ts`: for every `FIELD_PERMISSIONS` row, changing only that field in a fixture draft makes `requiredKeys` return exactly `{key}`; no change returns an empty set; changing phones and theme returns both keys. `editor-draft.test.ts`: price edit sets `sample: false` on that package only; Review Focus 3 (remove the Barat event that is `defaultEvent` with 3 packages → packages gone, `defaultEvent` undefined, result parses with `SiteDraftSchema`); new event "Mehndi Night" gets slug `mehndi-night`, a second gets `mehndi-night-2`; renaming keeps the slug; `swapMedia` replaces the key in all six places; settings path `["contact","nope"]` throws; `checkDraft` flags a package with `minGuests 1200` when `contact.guests.max` is 1000, a gallery tile whose key is not in media, an asset with `alt: ""`; `mediaUsage` lists the Barat background under its key; `sampleReport` on the Manor seed fixture counts all rows.
- [ ] **Step 2:** Run `npm test -- editor site-helpers`. Expected: FAIL.
- [ ] **Step 3:** Implement the schemas and functions. A fixture draft for tests lives in `tests/unit/fixtures/site-draft.ts`, built from `tests/unit/fixtures/tenant-settings.ts` plus a small catalogue.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`. Expected: PASS. Commit `feat(editor): draft shape, change rules and permission mirror`.

### Task 6: Draft table, snapshot, diff and `publish_site`

**Files:**
- Create: `supabase/migrations/20261026000500_site_drafts.sql`
- Test: `tests/db/site-publish.test.ts`

**Interfaces:**
- Produces (SQL):
  - `site_drafts (tenant_id uuid pk references tenants on delete cascade, revision int not null default 1, payload jsonb not null, changes jsonb not null default '{}' /* itemKey → { by uuid, name text, at timestamptz } */, updated_at timestamptz default now())`. RLS: select and delete for `auth_has_perm` of any of `catalogue.edit`, `prices.edit`, `venue.info.edit`, `tenant.settings.edit`, `media.manage`; no insert/update policy (server writes with the service role).
  - `site_snapshot(p_tenant uuid) returns jsonb` (stable, security invoker): `{ identity, theme, sections, messaging, content, events, packages, offers, addons, stageThemes }` in the camelCase row shapes of Task 5, arrays ordered by `sort, id`.
  - `site_diff(p_before jsonb, p_after jsonb) returns jsonb` (immutable): `{ before: {...}, after: {...} }` holding, for object parts, only the top-level keys that differ (e.g. `content.packages`), and for array parts only rows added, removed or changed (matched by `id`). Empty diff = `{ "before": {}, "after": {} }`.
  - `publish_site(p_tenant uuid, p_revision int) returns jsonb` (security invoker): `set_config('app.publishing','on',true)`; `v_before := site_snapshot(p_tenant)`; `delete from site_drafts where tenant_id = p_tenant and revision = p_revision returning payload` (no row → raise `site_changed`, errcode `40001`); applies only differing parts and rows (settings columns `identity, theme, sections, messaging, content`; catalogue rows: delete removed, insert added, update changed, events before packages); when `identity.name` changed also `update tenants set name`; `record_audit(p_tenant, 'site.publish', 'site', p_tenant, diff.before, diff.after, null)`; returns the diff. Any trigger error aborts everything, so the draft row comes back.
  - Grants: execute on the three functions to `authenticated`, `service_role`; revoke from `public`, `anon`.

- [ ] **Step 1: Write the failing tests** (as a seeded Manor manager via `asUser`, draft row inserted as postgres with `payload = site_snapshot(...)` edited in SQL): publish of a Gold price change updates that package only, deletes the draft, writes one `site.publish` audit row whose diff has only that package; publish with a stale revision raises `site_changed` and changes nothing; two sessions publishing the same revision (second connection from the pool, first commits) → exactly one succeeds, the other gets `site_changed`; a draft with a theme change published by the manager raises `needs tenant.settings.edit`, no table changed, the draft row is still there (union-of-keys rule); Review Focus 5 (manager changed a price, then a revoking override on `prices.edit` is inserted as postgres → that manager's publish fails, draft kept); Review Focus 3 at DB level (draft without the Barat event and its packages and without `defaultEvent` publishes; Barat rows deleted); draft isolation (after saving a draft, `getPublicCatalogue(manorId)` and the `tenant_settings` row are unchanged); `site_diff` of equal inputs is empty; anon and accounts read 0 `site_drafts` rows; manager `insert into site_drafts` fails.
- [ ] **Step 2:** Run `npm run test:db -- site-publish`. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `npm run db:seed && npm run test:db`. Expected: PASS. Commit `feat(editor): site drafts and atomic audited publish`.

### Task 7: Public site reads the new catalogue; edit mode markers

**Files:**
- Modify: `src/modules/catalogue/server/public.ts`, `src/modules/catalogue/index.ts`, `src/modules/site/server/load.ts`, `src/modules/site/index.ts`, `src/modules/site/ui/SiteShell.tsx`, `src/sections/types.ts`, `src/sections/packages/Packages.tsx`, `src/sections/packages/PackageTabs.tsx`, `src/sections/packages/packages.module.css`, `src/sections/{events,gallery,contact,hero,inside,stage,footer}/*.tsx` (markers only), `src/ui/i18n/en.ts`, `src/ui/tokens.css`
- Create: `src/sections/shared/edit.ts`
- Test: `tests/unit/packages-view.test.tsx`, `tests/unit/site-view.test.tsx`, `tests/db/catalogue-public.test.ts`, `tests/e2e/site-packages.spec.ts`

**Interfaces:**
- Consumes: Task 5 row schemas.
- Produces (`@/modules/catalogue`): `toPublicCatalogue(rows: { events; packages; offers; addons; stageThemes } /* Task 5 row arrays */): PublicCatalogue` (pure; active rows only, sorted) and `getPublicCatalogue` reimplemented on top of it. `PublicCatalogue` gains `id` on events, packages and offers, plus `addons: { id; name; pricePaisa; basis }[]`, `stageThemes: { id; name; description; pricePaisa; mediaKeys }[]`; `hasSample` covers all five tables.
- Produces (`@/modules/site`): `type RawSite` exported; `SiteShell({ site, mode = "public" })`, where `mode: "edit"` omits the `html.js` flag script, `ShellChrome` and the preview bar, so the page uses the no-JS layout M2 already guarantees (every frame a plain block, all text visible). `SiteView.editing?: true`.
- Produces (`src/sections/shared/edit.ts`): `editAttrs(site: SiteView, target: EditTarget, label: string): Record<string, string>` → `{}` unless `site.editing`, else `{ "data-edit": target, "data-edit-label": label }`. `type EditTarget` = `` `package:${id}` | `package-new:${eventId}` | `event:${id}` | "event-new" | `offer:${id}` | "offer-new" | `addon:${id}` | "addon-new" | `stage-theme:${id}` | "stage-theme-new" | "venue:phones" | "venue:hours" | "venue:address" | "venue:manager" | "gallery:tiles" | `section:${SectionKey}` ``. "-new" targets render an empty `<div>` placeholder only in edit mode.
- Packages: below the package cards and fine print, an "Extras" row (`t("packages.extras")`) lists active add-ons (`Rs 25,000` flat or `Rs 300 per guest`) and stage themes (`from Rs 150,000`) as cards in the offer-card style; hidden when both lists are empty. `PackageTabs` puts `role="tabpanel"` and `aria-labelledby` on panels only after hydration (`useSyncExternalStore` pattern from `ShellChrome`), fixing the no-JS tabpanel minor.
- `tokens.css` platform defaults match the "Standard marquee" template theme in `supabase/seed.sql` (accent `#785e2c`, muted `#5c574f`, keep the two fixed WhatsApp colours).

- [ ] **Step 1: Write the failing tests.** `packages-view.test.tsx`: one active add-on and one stage theme render one Extras row with `Rs 25,000` and `from Rs 150,000`; inactive ones are left out; no extras → no Extras heading; panels have no `tabpanel` role in server output. `site-view.test.tsx`: with `editing` the Gold card carries `data-edit="package:<id>"` and label `Edit Gold package`; without it no `data-edit` attribute appears anywhere in the rendered HTML. `catalogue-public.test.ts`: Manor `hasSample` stays true; adding a sample add-on as postgres keeps it true; ids are present.
- [ ] **Step 2:** Run `npm test -- packages-view site-view && npm run test:db -- catalogue-public`. Expected: FAIL.
- [ ] **Step 3:** Implement. Section components add `editAttrs` only; no other change to their output.
- [ ] **Step 4:** Run `npm test && npm run test:db && npm run test:e2e -- site`. Expected: PASS, M2 public specs unchanged (no-JS, reduced motion, no WebGL, 320/375). Commit `feat(site): show add-ons and stage themes, add edit-mode markers`.

### Task 8: Editor server functions

**Files:**
- Create: `src/modules/editor/server/draft.ts`, `src/modules/editor/server/view.ts`, `src/modules/editor/server/publish.ts`, `src/app/dashboard/site/actions.ts`
- Modify: `src/modules/editor/index.ts`, `src/ui/i18n/en.ts`
- Test: `tests/db/editor-draft.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces (`@/modules/editor`, all `server-only`):
  - `getDraft(tenantId): Promise<{ draft: SiteDraft; revision: number | null; changes: Record<string, { by: string; name: string; at: string }> }>` — the draft row, or the published `site_snapshot` with `revision: null` when none.
  - `writeDraft(db: SupabaseClient, tenantId, change: DraftChange, actor: { id: string; name: string }): Promise<{ revision: number }>` — reads the row (creating it from `site_snapshot` with `insert … on conflict do nothing`), `applyChange`, parses with `SiteDraftSchema`, then `update … where revision = <read revision>`; on 0 rows re-reads and retries, 3 tries, then throws `DraftError("busy")`. Exported for the db test; takes a service client.
  - `saveDraftChange(tenantId, change)` — viewer from `getViewer()`; refuses unless `requiredKeys(current, next)` ⊆ the viewer's keys (`ForbiddenError`), then `writeDraft` with the service client. Actor name = `profiles.full_name` or the auth email.
  - `publishDraft(tenantId, revision): Promise<{ ok: true } | { error: "siteChanged" | "blocked" | "invalid"; items?: string[] }>` — parses the stored draft, runs `checkDraft` (blocking issues → `invalid` with item labels), pre-checks `requiredKeys(published, draft)` against the viewer (→ `blocked` with the items from `changes` that need missing keys), then `rpc("publish_site")` on `createServerClient()`; maps `40001` → `siteChanged`, `42501` → `blocked`.
  - `discardDraft(tenantId, revision)` — deletes the row with that revision on the user's session (RLS); `siteChanged` when 0 rows.
  - `getDraftView(tenantId): Promise<SiteView>` — `buildSiteView` from the draft parts + published `money_rules`, slots, `getPublicMedia`, `toPublicCatalogue(draft)`, with `editing: true`.
- `src/app/dashboard/site/actions.ts`: Server Actions `saveChange(change: unknown)`, `publish(revision: number)`, `discard(revision: number)`, `markContentReal()` (super admin: settings change `content.sample = false`). Each takes the venue from `getDashboard()`, parses input with Zod (`DraftChangeSchema` exported from the editor index), returns `{ ok: true } | { error: TranslationKey; items?: string[] }`. No tenant id in any argument.

- [ ] **Step 1: Write the failing test** `editor-draft.test.ts` (service client against the seeded db): Review Focus 1 — two `writeDraft` calls started together on Manor (Gold price, an offer title) both resolve, the stored draft has both changes, `revision` is 2 higher than before, `changes` has two keys with the actor names; a change that fails `SiteDraftSchema` (empty phone) throws and leaves the row as it was; first save on a venue with no draft creates it from the published snapshot.
- [ ] **Step 2:** Run `npm run test:db -- editor-draft`. Expected: FAIL.
- [ ] **Step 3:** Implement the server functions and actions; strings for every error (`editor.siteChanged`: "The site changed while you were editing. Review it and publish again.", `editor.blocked`: "Some changes need a permission you don't have:", `editor.invalid`: "Fix these before publishing:").
- [ ] **Step 4:** Run `npm run test:db && npm run lint && npm run typecheck`. Expected: PASS. Commit `feat(editor): draft save, publish and discard actions`.

### Task 9: Media library and uploads

**Files:**
- Create: `src/modules/media/variants.ts`, `src/modules/media/server/library.ts`, `src/modules/media/ui/MediaPicker.tsx`, `src/app/dashboard/media/page.tsx`, `src/app/dashboard/media/actions.ts`, `src/app/dashboard/media/media-grid.tsx`
- Modify: `package.json` / `package-lock.json` (`sharp`), `next.config.ts` (Server Action body limit 16 MB; check the option name in `node_modules/next/dist/docs` for 16.4), `src/modules/media/index.ts`, `src/ui/i18n/en.ts`, `docs/ARCHITECTURE.md`
- Test: `tests/unit/media-variants.test.ts`, `tests/e2e/media.spec.ts`

**Interfaces:**
- Produces (pure, `@/modules/media`): `planVariants(width: number, height: number): { size: "s"|"m"|"l"; width: number; height: number }[]` — targets 1280 / 1920 / 2880 on the long side, never upscale, `s` always present (`min(1280, long side)`), the next size only when the source is longer than the previous target. `mediaKeyFrom(fileName: string): string` — slug of the base name (≤ 50 chars, fallback `photo`) + `-` + 6 random hex chars; matches `^[a-z0-9][a-z0-9-]{0,62}$`. `objectPath(tenantId: string, key: string, size: "s"|"m"|"l"|"depth", ext: string): string` — throws unless `tenantId` is a uuid, `key` matches the key regex and `ext` is `jpg`/`png`/`webp`; every Storage write and delete goes through it.
- Produces (server, `@/modules/media`): `processUpload(bytes: Buffer): Promise<{ ext: "jpg"|"png"; variants: { size; width; height; data: Buffer }[] } | { error: "type" | "tooLarge" | "tooManyPixels" | "animated" }>` — `sharp(bytes, { limitInputPixels: 40_000_000 })`, metadata `format` must be `jpeg`, `png` or `webp`, `pages` > 1 refused, `.rotate()`, PNG with alpha stays PNG, everything else JPEG quality 82 mozjpeg; metadata stripped. `uploadMedia(tenantId, file: File, input: { alt: string; category }): Promise<{ key } | { error }>`, `replaceMedia(tenantId, oldKey, file): Promise<{ key } | { error }>` (new asset with the old alt, then `saveDraftChange({ kind: "swapMedia", from, to })` through the editor index), `setAlt(tenantId, key, alt)`, `deleteMedia(tenantId, key): Promise<{ ok } | { error: "inUse"; usedIn: string[] }>` (in use = in `mediaUsage` of the published snapshot or the draft), `uploadDepth(tenantId, key, file)` (`tenant.settings.edit` only; PNG; aspect within 1 % of the asset's `m` or largest size; adds `depth` to `sizes`). All: `requirePerm(tenantId, "media.manage")` (depth: `tenant.settings.edit`), 15 MB cap checked before decoding, service client writes to `venue-media` at `<tenantId>/<key>/<size>.<ext>` with `cacheControl: "31536000"`, `media_assets` row with `dims` for every size, then `recordAudit` (`media.upload`, `media.alt`, `media.delete`, `media.depth`). Category: `gallery`, `stage`, `event`, `room` for everyone with `media.manage`; `hero`, `logo`, `seo` need `tenant.settings.edit`. The key and path are made on the server; no path or tenant comes from the browser.
- `MediaPicker` (client): grid of the venue's assets with alt text, search by alt, "Upload new" when the viewer has `media.manage`; returns a key. Used by Tasks 10–11.
- `/dashboard/media`: grid with alt, "Used in …", edit alt, replace, delete (disabled with the reason when in use), upload form (file, alt, category). Screen permission `media.manage`.

- [ ] **Step 1: Write the failing tests.** `media-variants.test.ts`: `planVariants(1000, 750)` → only `s` 1000×750; `(1600, 900)` → `s` 1280×720, `m` 1600×900; `(4000, 3000)` → s, m, l with l 2880×2160; portrait `(3000, 4000)` uses the height. `processUpload` (fixtures made in the test with `sharp`): Review Focus 4 — a text buffer → `type`; HEIC (unsupported format string from a stub buffer) → `type`; 20 000 × 20 000 PNG → `tooManyPixels`; 2-frame animated WebP → `animated`; a PNG with alpha → `ext: "png"`; a JPEG with EXIF orientation 6 comes out rotated (width and height swapped). `mediaKeyFrom("../../Hall Photo.JPG")` matches the key regex and starts with `hall-photo-`; `objectPath` throws for key `../x`, a non-uuid tenant and ext `svg`. `media.spec.ts` (Manor manager): uploads a 2400 px JPEG with alt, the grid shows it, the db row has `sizes {s,m}` and `dims` for both, both URLs return 200 `image/jpeg` under `/venue-media/<manorId>/`; uploading a `.txt` renamed `.jpg` shows the type error; deleting the Barat background shows "Used in Barat background"; staff gets the forbidden notice on `/dashboard/media`; the Manor grid and picker list no `demo-` keys (wrong-tenant isolation).
- [ ] **Step 2:** Run `npm test -- media-variants && npm run test:e2e -- media`. Expected: FAIL.
- [ ] **Step 3:** `npm install sharp@<lockfile version>`; implement; ARCHITECTURE media row (upload path, sizes, replace rule).
- [ ] **Step 4:** Run `npm test && npm run test:e2e -- media && npm run build`. Expected: PASS. Commit `feat(media): uploads with size variants, alt text, replace, delete and depth maps`.

### Task 10: Editor page, bar, overlay and catalogue panels

**Files:**
- Create: `src/app/dashboard/site/page.tsx`, `src/app/site-preview/page.tsx`, `src/modules/editor/ui/EditorBar.tsx`, `src/modules/editor/ui/EditOverlay.tsx`, `src/modules/editor/ui/Panel.tsx`, `src/modules/editor/ui/panels/{PackagePanel,EventPanel,OfferPanel,AddonPanel,StageThemePanel}.tsx`, `src/modules/editor/ui/fields.tsx` (labelled input, rupee input, list editor with add/remove/move up/down), `src/modules/editor/targets.ts`
- Modify: `src/proxy.ts` (`/site-preview` in `SESSION_PREFIXES`), `src/modules/editor/index.ts`, `src/ui/i18n/en.ts`
- Test: `tests/unit/editor-targets.test.ts`, `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: Task 7 `SiteShell mode "edit"` and `EditTarget`; Task 8 actions; Task 9 `MediaPicker`.
- Produces: `targetKeys(target: EditTarget): readonly PermissionKey[]` (any of) and `visibleTargets(keys: PermissionKey[]): (target: EditTarget) => boolean` in `targets.ts` (pure). Package and event targets: `catalogue.edit` or `prices.edit`; `package-new`: both `catalogue.edit` and `prices.edit`; offers, add-ons, stage themes: `catalogue.edit` or `prices.edit`; `venue:*`: `venue.info.edit`; `gallery:tiles`: `catalogue.edit`; `section:*`: `tenant.settings.edit`.
- `/dashboard/site` (screen perm from Task 1): `EditorBar` (unpublished change count from `changes`, "Still sample: …" from `sampleReport`, Laptop/Phone toggle, Discard, Publish; Publish and Discard pass the revision the page was rendered with and show the Task 8 messages with item lists) above `<SiteShell site={await getDraftView(venue.id)} mode="edit" />` and `<EditOverlay allowed={…} />`. Phone mode shows `<iframe src="/site-preview" title=…>` 375 px wide instead of the canvas.
- `EditOverlay` (client): finds `[data-edit]` elements, portals a ✎ `<button aria-label={data-edit-label}>` into each allowed one (placeholders get a "+ Add …" button), opens the matching panel, returns focus on close. Panels show the item's last change (`name`, time) from `changes`; fields the viewer cannot change are read-only with a one-line reason; Save calls `saveChange` and then `router.refresh()`; inline Zod messages on each field; Remove asks for confirmation.
- `/site-preview`: noindex, `getDashboard()` venue, refuses viewers without an editor key, renders `SiteShell` (public mode, full motion) from `getDraftView` with `editing` unset.

- [ ] **Step 1: Write the failing tests.** `editor-targets.test.ts`: manager sees package, offer, `venue:hours`, `gallery:tiles` but not `section:hero`; accounts sees none; a viewer with only `prices.edit` sees `package:<id>` but not `package-new:<id>`. `editor.spec.ts` (Manor `manager1`, 1440×900): opens Edit site; "Edit Gold package" under Barat; sets price to `4,500`, adds menu item "Live BBQ station", saves; the bar shows 1 change; the public site `manor.localhost:3000` still shows `Rs 4,200` and no "Live BBQ station" (draft isolation, page and JSON-LD); Phone toggle shows the iframe with the new price at 375 px; Publish → success; public site shows `Rs 4,500` and the item; `audit_events` has one `site.publish` row by manager1 for Manor; no ✎ for the hero; keyboard: Tab reaches the ✎, Enter opens the panel, Escape closes and focus is back on the ✎; at 375 px the panel fills the screen. Second test: a stale Publish (page rendered, then another session publishes) shows the "site changed" message. Run the M2 e2e set again in the same run.
- [ ] **Step 2:** Run `npm test -- editor-targets && npm run test:e2e -- editor`. Expected: FAIL.
- [ ] **Step 3:** Implement. Check the edit canvas in a browser at 1440 and 375: if a section's motion component still moves content without `html.js`, make that component return early when `document.documentElement.classList.contains("js")` is false.
- [ ] **Step 4:** Run `npm test && npm run test:e2e && npm run build`. Expected: PASS. Commit `feat(editor): on-page editor with draft, phone preview and publish`.

### Task 11: Venue info, gallery and super-admin panels

**Files:**
- Create: `src/modules/editor/ui/panels/{PhonesPanel,HoursPanel,AddressPanel,ManagerPanel,GalleryPanel,SectionPanel,ThemePanel,SectionsOrderPanel,VenuePanel}.tsx`, `src/modules/editor/ui/FieldsForm.tsx`
- Modify: `src/modules/editor/ui/EditorBar.tsx` (super admin menu: Theme, Sections, Venue, "Content is real"), `src/modules/site/theme.ts` + `src/modules/site/index.ts` (`FONT_NAMES`), `src/ui/i18n/en.ts`
- Test: `tests/unit/fields-form.test.tsx`, `tests/e2e/editor-admin.spec.ts`

**Interfaces:**
- Manager panels: phones (list, at least one), hours (per weekday: closed or open/close `HH:MM`; close earlier than open = past midnight, with a hint), address (text), manager card (`name`, `role`, `replyNote`), gallery tiles (ordered list via `MediaPicker`, move up/down, remove; `ratio` = the asset's aspect rounded to 2 decimals; at least 4 tiles, the schema minimum).
- `FieldsForm({ value, onChange })` (client): renders the current value's own shape — string → text input, string array → list editor, number → number input, boolean → checkbox, object with a string `key` → `MediaPicker` plus a `focus` input, nested objects → fieldsets with their key as legend (labels from `t()` when a key exists in `en.ts`, else the field name). Cannot add optional fields that are missing (`shortcut: optional fields absent from the venue's content cannot be added here; add a typed panel when the super admin needs one`). `SectionPanel` = `FieldsForm` over `content[<section>]`, validated on Save by the section's schema from `SiteContentSchema.shape`.
- Super-admin panels (`tenant.settings.edit`): `ThemePanel` (5 colours as colour + hex inputs, heading/body font selects from `FONT_NAMES` (new export from `@/modules/site`: `Object.keys(LOADED_FONTS)` in `theme.ts`), logo via `MediaPicker`), `SectionsOrderPanel` (visible checkbox, move up/down), `VenuePanel` (venue name, WhatsApp number digits only, map lat/lng, Instagram, Facebook, Google review link; https only). When hero mode is `depth` and a newly picked hero photo has no depth map, the panel offers "Upload depth map" (Task 9 `uploadDepth`) or "Switch hero to photos".
- "Content is real": calls `markContentReal`, shown only to the super admin while `content.sample` is true.

- [ ] **Step 1: Write the failing tests.** `fields-form.test.tsx`: renders inputs for `{ chapter: "x", lines: ["a","b"], background: { key: "g3", focus: "50% 50%" } }` with one text input, a two-item list, one picker; no "add field" control. `editor-admin.spec.ts`: manager1 changes Sunday hours and the manager card, publishes, public contact shows them; manager1 sees no Theme/Sections/Venue menu; the super admin (aal2, Open dashboard → Manor) changes a hero caption line and the primary colour, publishes, the public page shows both; super admin presses "Content is real" and publishes, then with all Manor sample rows cleared as postgres the public page has no `noindex`; a manager whose draft contains the super admin's unpublished theme change gets the "needs a permission" message listing "Theme".
- [ ] **Step 2:** Run `npm test -- fields-form && npm run test:e2e -- editor-admin`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test && npm run test:e2e && npm run build`. Expected: PASS. Commit `feat(editor): venue info, gallery and super-admin panels`.

### Task 12: Settings screen

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/settings/actions.ts`, `src/app/dashboard/settings/{halls-form,slots-form,date-prices-form,money-rules-form}.tsx`, `src/modules/tenants/server/venue-setup.ts`
- Modify: `src/modules/tenants/index.ts`, `src/ui/i18n/en.ts`, `docs/ARCHITECTURE.md`
- Test: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: Task 3 halls rules, Task 4 `@/modules/calendar`.
- Produces (`@/modules/tenants`): `listHalls`, `saveHall(tenantId, input)` (Zod `{ id?; name 1–60; capacityMin ≥ 0; capacityMax ≥ capacityMin; isActive; hirePricePaisa: int > 0 | null }`), `listSlots`, `saveSlot` (`{ id?; name; start "HH:MM"; end "HH:MM"; bufferMinutes ≥ 0 }`), `deleteSlot`, `getMoneyRules`, `saveMoneyRules(tenantId, input: MoneyRulesSchema without currency/timeZone)`. Halls, slots: user session client (RLS, triggers, audit trigger). Money rules: `requirePerm(tenantId, "tenant.settings.edit")`, service client update of `money_rules` only, `recordAudit("settings.money_rules", before, after)`.
- Page sections, each shown only to holders of its key: Halls (all fields `tenant.settings.edit`; hire price also editable with `prices.edit`, entered in rupees), Slots (`tenant.settings.edit`, with the note "Slot names show on the enquiry form at once"), Date prices (`calendar.manage`: list, add, edit, delete, event-type select incl. "All events", overlap error text), Money rules (`tenant.settings.edit`: tax %, advance %, hold hours, instant booking, payment methods).

- [ ] **Step 1: Write the failing test** `settings.spec.ts`: manager1 sees Halls (only hire price editable) and Date prices, not Slots or Money rules; sets a hall hire price `250,000` → stored `25000000`; adds date price 2026-12-01..10 +20 % "Wedding season", then an overlapping all-events range shows the overlap message; accounts gets the forbidden notice; the super admin changes advance to 40 % and an `audit_events` row `settings.money_rules` exists; nothing on the public page changes.
- [ ] **Step 2:** Run `npm run test:e2e -- settings`. Expected: FAIL.
- [ ] **Step 3:** Implement; ARCHITECTURE rows for settings and date prices.
- [ ] **Step 4:** Run `npm run test:e2e && npm run lint && npm run typecheck`. Expected: PASS. Commit `feat(settings): halls, slots, date prices and money rules screen`.

### Task 13: Docs and full check

**Files:**
- Modify: `docs/ARCHITECTURE.md` (rows: editor, draft and publish, field permissions, catalogue, calendar, media uploads; replace "A price, menu, package…→ Dashboard → Catalogue" with "Dashboard → Edit site"), `docs/ROADMAP.md` (M3 status, built list, notes for M4: date price rule, add-on basis, offer discounts, hall hire price, stage themes for M8), `docs/DECISIONS.md` (draft storage, publish-only writes and the `app.publishing` guard with its limit, direct-save list, upload path shortcut, replace = new key), `docs/JOURNEYS.md`, `docs/SITEMAP.md`, `docs/DATA_MODEL.md` (new tables and columns), `.env.example` if anything new.

- [ ] **Step 1:** Update the docs above from the code as built (no invented commands).
- [ ] **Step 2:** Run `npm run db:seed && npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e && npm run build`. Expected: all PASS. Record the counts in ROADMAP.
- [ ] **Step 3:** Commit `docs: M3 architecture, roadmap and decisions`. Then the milestone code review (whole branch) before asking to merge.
