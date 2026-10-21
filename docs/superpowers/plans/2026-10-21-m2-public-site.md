# M2 Public Site from Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each venue's host renders the approved mockup v6 public site from its own settings, catalogue and media: Manor at `manor.localhost:3000` looks and moves like the mockup, the demo hall at `demo.localhost:3000` renders the same sections with its own data, with no code change between them.

**Architecture:** Venue data lives in three places: a new `content` block in `tenant_settings` (texts, media references, hero mode), a minimal catalogue slice (`event_types`, `packages`, `offers`) and a media slice (`media_assets` table plus a public-read Storage bucket). A new `site` module loads all of it server-side for the tenant resolved by `src/proxy.ts` and renders the sections in settings order through a registry. Each section in `src/sections/<key>/` server-renders its content (works without JavaScript), and one shared client motion system adds the mockup's scroll effects on top. Depth parallax is a lazy WebGL2 layer on the hero, used only when the device can afford it.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents: true`, `next/font/google`), React 19.3, Supabase (Postgres + Storage, local Docker stack), Zod 4.6.7, Vitest 5, Playwright 1.64, CSS Modules for section styles (ported from the mockup), plain WebGL2 for depth. Offline tools: Anaconda Python (`D:/Softwares/Anaconda3/python`) with Pillow and `onnxruntime` (pip, user-approved 2026-10-21).

**Spec:** `docs/superpowers/specs/2026-10-21-m2-public-site-design.md` (parent: `docs/superpowers/specs/2026-10-19-manor-marquee-design.md` §5, §13, §14, §15). Visual source of truth: `.superpowers/brainstorm/1089-1792319084/content/public-site-v6.html` (markup lines 175–323, CSS lines 9–171, script lines 325–437). Read both before any task.

## Global Constraints

- Branch `feat/m2-public-site`; never commit to `main`. Every commit message ends with `Co-authored-by: Umair Abbasi <umairabbasi.019@gmail.com>`; no Claude/Anthropic credit.
- No new npm runtime dependency. Dev-only tools need a line in the commit message saying why.
- Never trust a tenant ID from the browser: the site reads only `x-tenant-id` / `x-tenant-status` set by `src/proxy.ts`. Anon gets no direct table access; public data goes through server code with the service client, filtered by that tenant ID.
- Every new table: RLS enabled, policies for `authenticated` only, and a negative test.
- Money is integer paisa in the database (`3200` Rs per guest = `320000`). Display: `Rs 3,200`; lakh total `(rupees × minGuests / 1e5).toFixed(1)`.
- Import other modules only through their `index.ts`. Add every new module name to `modules` in `eslint.config.mjs`.
- Sections in `src/sections/` import no module code at runtime (`import type` from a module index is allowed). Client-safe helpers live in `src/sections/shared/`.
- No colour, font or venue string hard-coded in a section. Colours come from CSS variables `--color-bg`, `--color-accent`, `--color-text`, `--color-muted`, `--color-deep`; fonts from `--font-heading`, `--font-body`. Mockup `rgba(...)` tints become `color-mix(in srgb, var(--color-…) N%, transparent)`.
- Venue copy lives in venue data. Platform UI strings (status bar, holding page, "Checking hours…", enquiry labels) go through `t()` in `src/ui/i18n/en.ts`.
- Any button for a feature not built yet is hidden, not disabled ("See stage themes" is not rendered in M2).
- Image size by long side × DPR: ≤1400 `s`, ≤2200 `m`, else `l`; fall back to the nearest size the asset has. Full-screen shots only from assets with source ≥1600 px. Never seek a `<video>`.
- Reduced motion: no smoothing, no transforms, no dust/grain/leak animation, every caption readable. No WebGL: approved transform effect. No JavaScript: all text, prices, call and directions links present.
- WhatsApp and call use the user's test number `923085021418` / `+923085021418` as seed data (venue data, not code).
- Report only checks actually run.

## Review Focus

1. Hidden or reordered sections → page renders the remaining sections in the new order with no empty gap, and nav and footer links to hidden sections disappear (unit test in Task 5).
2. Optional data missing (no rating, no Instagram, no map location, a content media key with no asset, an event with zero packages) → that element or tab is left out, nothing shows `undefined` or a broken image (unit tests in Tasks 5 and 7).
3. Clock near midnight in Asia/Karachi while the browser is in another zone, and hours that close after midnight → Open/Closed and the earliest bookable date follow the venue time zone (unit tests in Task 4).
4. One venue's assets on another's host → every image URL on `demo.localhost` is under the demo tenant's `<tenant_id>/` prefix and none under Manor's (e2e in Task 8).
5. Narrow phone (320 px) or a long caption/package name → no horizontal page scroll, text wraps (e2e in Task 9).

---

### Task 1: Site content and theme schema, seed script

**Files:**
- Create: `supabase/migrations/20261022000100_site_content.sql`
- Modify: `src/modules/tenants/settings.ts`, `src/modules/tenants/index.ts` (exports), `supabase/seed.sql` (template theme gets `muted`, `deep`), `tests/unit/fixtures/tenant-settings.ts`, `package.json` (`db:seed`)
- Create: `scripts/seed-site.ts`, `scripts/seed-data/manor.ts`, `scripts/seed-data/demo.ts`
- Test: `tests/unit/site-content.test.ts`, `tests/db/seed.test.ts` (extend)

**Interfaces:**
- Produces (SQL): `tenant_settings.content jsonb not null default '{}'`; `create_tenant_from_template` (redefined in this migration) also copies `settings.content` (default `'{}'`) and validates it is an object.
- Produces (TS, from `@/modules/tenants`): `SiteContentSchema`, `type SiteContent`, `MediaRefSchema` (`{ key: string; focus?: string }`, focus matches `/^\d{1,3}% \d{1,3}%$/`), `HERO_MODES = ["photos","depth","sequence"]`. `ThemeSchema` gains `colors.muted`, `colors.deep` (required hex) and `logo?: string` (media key). `TenantSettingsSchema` gains `content: SiteContentSchema`.
- Produces: `npm run db:seed` = `supabase db reset && tsx scripts/seed-users.ts && tsx scripts/seed-site.ts`. `seed-site.ts` uses `assertLocalSupabaseUrl`, parses every seed object with its Zod schema before writing, and also writes the demo content into the "Standard marquee" template payload (`settings.content`, flagged `sample: true`) so new tenants start with neutral text.

`SiteContentSchema` shape (`Lines` = 1–3 strings, `*word*` marks the accent italic):
`sample: boolean (default false)`; `seo { title, description, image: key }`; `nav { brand, cta, links: [{ section: SectionKey, label }] }`; `hero { mode (default "photos"), front: MediaRef, hall: MediaRef, captions { arrival: Caption & { primaryCta, secondaryCta }, doors: Caption, hall: Caption } }`; `inside { chapter, title: Lines, rooms: 1–4 × { media: MediaRef, chapter, lines: Lines } }`; `stage { background: MediaRef, reveal: MediaRef, caption: Caption }`; `gallery { chapter, lines, followLabel?, tiles: ≥4 × { key, ratio > 0 }, rating?: { value 0–5, count int, source, checkedOn (YYYY-MM-DD), url } }`; `events { chapter, checkCta (must contain "{event}"), packagesCta }`; `packages { chapter, lines, lead, fine, background: MediaRef, defaultEvent?: slug }`; `contact { media: MediaRef, lines, lead, greeting, otherEvent, guests { min, max, step, default } (min ≤ default ≤ max), manager { name, role, replyNote }, sendCta (contains "{name}"), callCta (contains "{phone}"), compareLink, openText, closedText (contains "{time}"), map { title, place, facts: [{ label, value }], directionsCta } }`; `footer { line, copyright, mark }`. `Caption` = `{ chapter, lines: Lines, body? }`.

- [ ] **Step 1: Write the failing test** `tests/unit/site-content.test.ts`: `SiteContentSchema.parse(manorContent)` and `.parse(demoContent)` succeed (import from `scripts/seed-data/*`); a copy with `events.checkCta: "Check a date"` fails; `contact.guests` with `default: 2000, max: 1000` fails; `hero.mode` missing parses to `"photos"`; `MediaRefSchema` rejects `focus: "center"`; `ThemeSchema` rejects a theme without `colors.deep`.
- [ ] **Step 2:** Run `npm test -- site-content`. Expected: FAIL (schema and seed data missing).
- [ ] **Step 3:** Write the migration, extend `settings.ts`, update the template theme in `seed.sql` (demo/platform: muted `#8a857d`, deep `#9c7a3c`) and the unit fixture.
- [ ] **Step 4:** Write `scripts/seed-data/manor.ts`: every string verbatim from mockup v6 (nav "THE MANOR" / "Check a date"; hero captions lines 193–195; inside lines 208–211; stage line 222; gallery lines 230–232 with rating 4.5 / 829 / Google / 2026-10-19 and the maps search URL; events chapter "Every celebration", `checkCta: "Check a {event} date"`; packages lines 255–260, `defaultEvent: "barat"`; contact lines 274–312 with manager `{ name: "Ahmed", role: "events manager", replyNote: "Replies in about 15 minutes, 11 AM to 9:30 PM" }`, `closedText: "Closed now · opens {time}, leave a WhatsApp message"`; footer line 321–322), `sample: true` (manager name and prices are samples). Media keys = mockup file stems (`ext-night`, `wide`, `g3`, `g7`, `lounge`, `stage`, …; gallery tiles and ratios from `GAL` line 344). Also the identity/messaging/theme patch: phones `["+923085021418"]`, `whatsappNumber: "923085021418"`, address "Marquee Complex, Islamabad Expressway", map 33.6476537, 73.1076748, opening hours days 0–6 `11:00`–`21:30`, Instagram `https://instagram.com/themanormarquee`, theme primary `#d9bf8c` background `#0b0405` text `#f4ece0` muted `#b3a597` deep `#5b0f1a`, logo `logo`.
- [ ] **Step 5:** Write `scripts/seed-data/demo.ts`: short neutral copy for "Demo Hall" (builder writes it; same structure, no Manor names or facts), `sample: true`, platform theme, demo media keys from Task 3 (`demo-front`, `demo-hall`, `demo-room-1..3`, `demo-stage`, `demo-tile-1..6`).
- [ ] **Step 6:** Write `scripts/seed-site.ts` (content + identity/theme/messaging patch + template content; catalogue and media are added in Tasks 2–3) and update `db:seed`.
- [ ] **Step 7:** Extend `tests/db/seed.test.ts`: after seed, each demo tenant's `tenant_settings` row parses with `TenantSettingsSchema`; Manor content `sample` is true. Run `npm run db:seed && npm test -- site-content && npm run test:db -- seed`. Expected: PASS.
- [ ] **Step 8:** Run `npm run lint && npm run typecheck`. Commit `feat(tenants): add site content block and seed venue content`.

### Task 2: Catalogue slice (event types, packages, offers)

**Files:**
- Create: `supabase/migrations/20261022000200_catalogue.sql`, `src/modules/catalogue/index.ts`, `src/modules/catalogue/server/public.ts`
- Modify: `eslint.config.mjs` (add `catalogue`), `scripts/seed-site.ts`, `scripts/seed-data/manor.ts`, `scripts/seed-data/demo.ts`, `src/modules/tenants/server/admin.ts` (packages count)
- Test: `tests/db/catalogue.rls.test.ts`, `tests/db/catalogue-public.test.ts`

**Interfaces:**
- Produces (SQL): `event_types (id uuid pk, tenant_id, slug, name, description, media_key text null, sort int, sample bool default false, unique (tenant_id, slug), unique (tenant_id, id))`; `packages (id, tenant_id, event_type_id, name, price_per_guest_paisa int check > 0, min_guests int check > 0, items text[] not null, featured bool default false, sort int, sample bool, foreign key (tenant_id, event_type_id) references event_types (tenant_id, id) on delete cascade)`; `offers (id, tenant_id, title, body, sort, active bool default true, sample bool)`. RLS read `auth_has_perm(tenant_id, 'bookings.view')`, write `auth_has_perm(tenant_id, 'catalogue.edit')`. (M3 adds `prices.edit` on price columns.)
- Produces (TS): `getPublicCatalogue(tenantId: string): Promise<PublicCatalogue>` with `PublicCatalogue = { events: { slug; name; description; mediaKey: string | null; packages: { name; pricePerGuestPaisa: number; minGuests: number; items: string[]; featured: boolean }[] }[]; offers: { title; body }[]; hasSample: boolean }`, sorted by `sort`, active offers only. Server-only, service client, always `.eq("tenant_id", tenantId)`.

- [ ] **Step 1: Write the failing tests.** `catalogue.rls.test.ts` (pattern of `tests/db/access.rls.test.ts`): anon selects 0 rows from all three tables; Manor staff (has `bookings.view`) reads Manor rows and 0 demo rows; Manor staff insert into `packages` fails (no `catalogue.edit`); Manor manager insert succeeds; inserting a Manor package whose `event_type_id` belongs to demo fails (composite FK); `price_per_guest_paisa = 0` fails. `catalogue-public.test.ts`: after seed, `getPublicCatalogue(manorId)` returns 5 events in order Mehndi, Barat, Valima, Nikkah, Corporate, Barat's Gold has `pricePerGuestPaisa: 420000`, `minGuests: 300`, `featured: true`, 3 offers, `hasSample: true`; demo result contains no Manor event names.
- [ ] **Step 2:** Run `npm run test:db -- catalogue`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and `getPublicCatalogue`.
- [ ] **Step 4:** Seed Manor from the mockup: events and descriptions from `EV_TEXT` (line 347), event media keys `hall-floral`, `stage-floral`, `g4`, `candles`, `dining` (lines 240–244), packages from `PKGS` (lines 402–408, rupees × 100, the second package of each event `featured`), offers lines 262–264, all `sample: true`. Seed demo with 3 neutral events, 2 packages each, 1 offer, `sample: true`.
- [ ] **Step 5:** Replace the `packages: 0` shortcut in `admin.ts` with the real count (keep the comment for the remaining shortcuts).
- [ ] **Step 6:** Run `npm run db:seed && npm run test:db`. Expected: all PASS. Commit `feat(catalogue): add event types, packages and offers with RLS`.

### Task 3: Media slice (bucket, assets table, seed upload, demo images)

**Files:**
- Create: `supabase/migrations/20261022000300_media.sql`, `src/modules/media/index.ts`, `src/modules/media/server/assets.ts`, `scripts/seed-media.ts`, `scripts/seed-data/media-manifest.ts`, `tools/make_demo_images.py`, `scripts/seed-data/demo-media/*.jpg` (generated, committed, small)
- Modify: `eslint.config.mjs` (add `media`), `scripts/seed-site.ts` (calls media seed), `src/modules/tenants/server/admin.ts` (hero media count), `.env.example` (`MANOR_MEDIA_DIR`)
- Test: `tests/db/media.rls.test.ts`, `tests/db/media-public.test.ts`

**Interfaces:**
- Produces (SQL): public bucket `venue-media` (`insert into storage.buckets (id, name, public) values ('venue-media','venue-media', true)`), no insert/update/delete storage policies (writes only with the service role). `media_assets (id, tenant_id, key, alt, category text check in ('hero','room','stage','gallery','event','logo','seo'), source text, licence text, sizes text[] not null check (sizes <@ array['s','m','l','depth']), ext text default 'jpg', unique (tenant_id, key))`. RLS read and write `auth_has_perm(tenant_id, 'media.manage')`.
- Produces (TS): `type MediaView = { key: string; alt: string; urls: Partial<Record<"s"|"m"|"l", string>>; depthUrl?: string }`; `getPublicMedia(tenantId: string): Promise<Record<string, MediaView>>` (service client, tenant-filtered); URL = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-media/<tenant_id>/<key>/<size>.<ext>` (depth: `depth.png`).
- Storage path rule: `<tenant_id>/<key>/{s,m,l}.<ext>` and `<tenant_id>/<key>/depth.png`.

- [ ] **Step 1: Write the failing tests.** `media.rls.test.ts`: anon reads 0 rows; Manor staff (no `media.manage`) reads 0; Manor manager reads Manor rows only; `sizes = '{xl}'` fails. `media-public.test.ts` (after seed): Manor map has `ext-night` with `s`, `m`, `l` URLs all starting with `.../venue-media/<manorId>/ext-night/`; `logo` has ext `png`; demo map keys all start with `demo-`; fetching one Manor `m` URL returns 200 `image/jpeg`.
- [ ] **Step 2:** Run `npm run test:db -- media`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and `getPublicMedia`.
- [ ] **Step 4:** Write `media-manifest.ts`: one row per key used by Manor content and catalogue (`key`, source file stem, `alt` written for a screen-reader user, `category`, `source` from `references/venue/manifest.csv`, `licence: "owner-approved 2026-10-18"`). `seed-media.ts`: for each row map `e-<stem>-s.jpg`→`s`, `e-<stem>.jpg`→`m`, `e-<stem>-l.jpg`→`l` (only files that exist; `logo.png`→`m`, ext `png`), upload with `upsert: true` and `cacheControl: "31536000"`, upsert `media_assets`. Source dir `MANOR_MEDIA_DIR` (default `.superpowers/brainstorm/1089-1792319084/content`); missing dir → throw with a clear message unless `SKIP_MANOR_MEDIA=1`. Local guard as in `seed-users.ts`.
- [ ] **Step 5:** Write `tools/make_demo_images.py` (Anaconda Pillow): soft gradients with simple arch/circle shapes in platform colours, `s` 1280 px and `m` 1920 px long side, JPEG q80, into `scripts/seed-data/demo-media/`. Run it with `D:/Softwares/Anaconda3/python tools/make_demo_images.py`. `seed-media.ts` uploads them under the demo tenant.
- [ ] **Step 6:** Replace the `heroMedia: 0` shortcut in `admin.ts` with a count of `category = 'hero'` assets.
- [ ] **Step 7:** Run `npm run db:seed && npm run test:db`. Expected: all PASS. Commit `feat(media): add venue media bucket, assets table and seed upload`.

### Task 4: Client-safe helpers

**Files:**
- Create: `src/sections/shared/image.ts`, `hours.ts`, `enquiry.ts`, `format.ts`, `lines.tsx`
- Modify: `src/ui/i18n/en.ts` (enquiry labels)
- Test: `tests/unit/site-helpers.test.ts`

**Interfaces (all pure, no module imports):**
- `pickImageSize(longSide: number, dpr: number, sizes: ("s"|"m"|"l")[]): "s"|"m"|"l"` — ideal by `longSide × min(dpr, 3)` (≤1400 s, ≤2200 m, else l), else nearest present (prefer larger).
- `openStatus(hours: {day,open,close}[], timeZone: string, now: Date): { open: boolean; opensAt: string | null }` — `opensAt` like `"11 AM"` / `"9:30 PM"` for the next opening (today or a later day); a close earlier than open means past midnight and the open window continues into the next day.
- `todayIn(timeZone: string, now: Date): string` (`YYYY-MM-DD`) and `addDays(date: string, n: number): string`.
- `buildEnquiryMessage(input: { greeting: string; date: string | null; event: string; slot: string; guests: number; pkg?: { name: string; pricePerGuestPaisa: number }; name?: string }): string` — exact format of mockup line 392 (labels "Date:", "Event:", "Guests: about", "Package:", "Name:" from `t()`; date shown `en-GB` weekday short, day numeric, month short, year numeric, or `t("enquiry.dateUndecided")` = "not decided").
- `waLink(number: string, text: string): string` = `https://wa.me/<digits>?text=<encodeURIComponent(text)>`.
- `formatRs(paisa: number): string` → `"Rs 3,200"`; `lakhFrom(pricePerGuestPaisa: number, guests: number): string` → `"9.6"`; `formatLocalPhone(e164: string): string` → `"+923085021418"` ⇒ `"0308 502 1418"` (shortcut: Pakistan numbers only, upgrade when a non-PK venue signs up; other numbers returned as given).
- `Lines({ lines, as })`: renders each line as the mockup's `<span class="line"><span>…</span></span>` with `*word*` → `<em>word</em>`; plain text only (no HTML injection).

- [ ] **Step 1: Write the failing tests** with these cases: `pickImageSize(900, 2, ["s","m","l"]) === "m"`, `(900, 3, …) === "l"`, `(1400, 1, ["m","l"]) === "m"`, `(3000, 1, ["s"]) === "s"`; `openStatus` Manor hours at `2026-10-21T15:59:00Z` (20:59 PKT) open, at `16:31Z` (21:31 PKT) closed with `opensAt "11 AM"`, at `2026-10-21T19:30:00Z` (00:30 PKT next day) closed; hours `{open:"18:00",close:"02:00"}` at 01:00 PKT → open; empty hours → `{ open: false, opensAt: null }`; `todayIn("Asia/Karachi", new Date("2026-10-21T19:30:00Z")) === "2026-10-22"`; `buildEnquiryMessage` with date `"2026-12-10"`, Barat/Dinner/400/Gold 420000/"Ayesha" equals `` `Assalam o Alaikum, I'd like to check availability.\nDate: ${d}\nEvent: Barat (Dinner)\nGuests: about 400\nPackage: Gold (Rs 4,200 per guest)\nName: Ayesha` `` where `d` is `new Date("2026-12-10T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })` (ICU decides the comma, so the test computes it the same way); date null gives `Date: not decided`; `waLink("+92 308 5021418", "a b")` = `https://wa.me/923085021418?text=a%20b`; `formatRs(320000) === "Rs 3,200"`; `lakhFrom(420000, 300) === "12.6"`; `formatLocalPhone("+923085021418") === "0308 502 1418"`; `Lines` on `"but an *experience*"` renders one `em`, and on `"<b>x</b>"` renders the text literally.
- [ ] **Step 2:** Run `npm test -- site-helpers`. Expected: FAIL.
- [ ] **Step 3:** Implement (use `Intl.DateTimeFormat` with `timeZone`; no date library).
- [ ] **Step 4:** Run `npm test -- site-helpers`. Expected: PASS. Commit `feat(site): add image, hours, enquiry and money helpers`.

### Task 5: Site module, page wiring, shell and motion engine

**Files:**
- Create: `src/modules/site/index.ts`, `src/modules/site/server/load.ts`, `src/modules/site/sections.ts` (registry), `src/modules/site/theme.ts`, `src/modules/site/fonts.ts`, `src/modules/site/seo.ts`, `src/modules/site/ui/SiteShell.tsx` (nav, letterbox, grain, leak, dust canvas, status bar), `src/modules/site/ui/site.module.css`
- Create: `src/sections/types.ts`, `src/sections/shared/motion.ts` (client), `src/sections/shared/Shot.tsx` (client), `src/sections/footer/Footer.tsx` + `footer.module.css`
- Modify: `src/app/page.tsx` (render site; keep platform-host home, paused holding page, 404), `src/ui/i18n/en.ts`, `eslint.config.mjs` (add `site`), `src/sections/README.md`
- Test: `tests/unit/site-view.test.ts`, `tests/unit/site-theme.test.ts`, `tests/e2e/site.spec.ts` (status cases)

**Interfaces:**
- Consumes: `SiteContentSchema`, `TenantSettingsSchema` pieces (Task 1), `getPublicCatalogue` (Task 2), `getPublicMedia` (Task 3), helpers (Task 4).
- Produces (`src/sections/types.ts`, type-only): `SiteView = { tenantId; name; status: "setup"|"live"; content: SiteContent; media: Record<string, MediaView>; catalogue: PublicCatalogue; contact: { phone?: string; whatsapp?: string; hours; timeZone; address?; map?: {lat,lng}; instagram?: string }; slots: string[]; sections: SectionKey[] (visible, in order); navLinks: { href: string; label: string }[] }` and `SectionProps = { site: SiteView }`.
- Produces (site module): `buildSiteView(raw: RawSite): SiteView` (pure: keeps visible sections in settings order and drops nav links to hidden sections; missing media is handled in the sections, which check `site.media[key]`); `getPublicSite(tenantId: string): Promise<SiteView | null>` (null if settings fail to parse; logs the Zod error server-side); `themeStyle(theme): React.CSSProperties` (sets `--color-*`, `--font-*`); `siteMetadata(view, primaryHost): Metadata` (title, description, OG image `m` URL, canonical `https://<primary host>/`, `robots: { index: false }` when status is `setup` or `content.sample || catalogue.hasSample`); `eventVenueJsonLd(view, primaryHost)` (`@type: EventVenue`, name, address, geo, telephone, url, image, `aggregateRating` only when rating exists); `SECTION_COMPONENTS: Partial<Record<SectionKey, ComponentType<SectionProps>>>` (made total in Task 8).
- Produces (motion, client): `useScrollFrame(cb: (dt) => void)` (one shared rAF loop for the page, paused when the tab is hidden, never started under reduced motion), `smoothedProgress(id: string, el: HTMLElement): number` (mockup `prog` + `lerp .09`), `useReveal()` (IntersectionObserver threshold .15 adding `on` to `[data-r]`), `prefersReducedMotion(): boolean`. A tiny inline script in the shell sets `html.js`; every "hidden until revealed" style in section CSS is scoped under `.js`, and reduced-motion CSS shows everything.
- Fonts: `next/font/google` for Cormorant Garamond (300, 400, italic 300/400) and Inter (400, 500, 600), `display: "swap"`; theme font names map to these; an unknown name falls back to `Georgia, serif` / `system-ui, sans-serif`.

- [ ] **Step 1: Write the failing tests.** `site-view.test.ts`: sections `[contact hidden, footer, hero…]` reordered → `view.sections` equals visible keys in settings order and `navLinks` has no `#contact`; missing `instagram` → `contact.instagram` undefined and footer renders no Instagram link (render with `react-dom/server` `renderToStaticMarkup`); `siteMetadata` with `content.sample: true` gives `robots.index === false`, with status `live` and no samples gives index allowed; JSON-LD omits `aggregateRating` when `gallery.rating` is absent. `site-theme.test.ts`: `themeStyle(manorTheme)["--color-deep"] === "#5b0f1a"`; unknown heading font → `--font-heading` contains `Georgia`.
- [ ] **Step 2:** Run `npm test -- site-view site-theme`. Expected: FAIL.
- [ ] **Step 3:** Implement the module, the shell (port mockup CSS lines 9–44 and nav/menu/letterbox/grain/leak/dust; drop the `#tog` compare button; dust colour reads `--color-accent`), `Shot` (renders a `div` with role `img` + `aria-label` alt, SSR background = `m` URL or nearest, client upgrades via `pickImageSize(max(innerWidth, innerHeight), devicePixelRatio, sizes)`; renders nothing when the asset is missing), Footer (mockup lines 320–323), and `page.tsx`: platform host → existing home; no tenant → `notFound()`; `paused` → existing holding page plus `robots noindex` metadata; `setup` → full site plus a thin bar `t("site.previewBar")` = "Preview, not open yet"; `live` → site. Use `generateMetadata` with the same header reads (keep the Suspense pattern the page already uses for `cacheComponents`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: e2e** `tests/e2e/site.spec.ts`: `manor.localhost:3000` has `<title>` from content and no preview bar; `demo.localhost:3000` shows "Preview, not open yet" and `meta[name=robots]` contains `noindex`; `nobody.localhost:3000` returns 404; existing paused-holding test in `admin.spec.ts` still passes. Run `npm run test:e2e -- site admin`. Expected: PASS.
- [ ] **Step 6:** Run `npm run lint && npm run typecheck && npm run build`. Commit `feat(site): render venue site shell from tenant config`.

### Task 6: Hero, Inside and Stage sections

**Files:**
- Create: `src/sections/hero/Hero.tsx` + `hero.module.css`, `src/sections/inside/Inside.tsx` + `inside.module.css`, `src/sections/stage/Stage.tsx` + `stage.module.css`
- Modify: `src/modules/site/sections.ts` (register three)
- Test: `tests/e2e/site-motion.spec.ts`

**Interfaces:**
- Consumes: `SectionProps`, `Shot`, `Lines`, `useScrollFrame`, `smoothedProgress` (Task 5).
- Behaviour copied from mockup script lines 350–370: hero pin `340vh` (push, cross at .4–.49, settle, captions at 0 / .2 / .58, dip after .9); inside pin `320vh` with `f = progress × rooms.length` (the mockup's `× 3` generalised to the room count); stage pin `280vh` (circular reveal `--r` 35%→115%, caption on after .55, scrim). Section element ids stay `hero`, `inside`, `detail` (stage) so mockup anchors work; hero CTAs link `#contact` and `#inside`, and the secondary CTA is left out when Inside is hidden. "See stage themes" is not rendered.
- Server markup holds every caption and image; the client component only adds classes and transforms. Reduced motion: pins collapse so each caption sits on its own photo frame (one 100vh block per caption), no transforms.

- [ ] **Step 1: Write the failing e2e** `site-motion.spec.ts` on Manor at 1440×900: after scrolling to 30% of `#hero` and waiting 1.5 s, the "Step inside" heading is visible; at 70% "A thousand lights" is visible; in `#inside`, the "Lounge" caption is visible near the end; with `page.emulateMedia({ reducedMotion: "reduce" })`, every hero/inside/stage heading becomes visible when scrolled into view and no `[role=img]` inside those sections has a computed transform other than `none`; with JavaScript disabled (`browser.newContext({ javaScriptEnabled: false })`), all hero caption texts exist in the DOM and are not `visibility: hidden` / `opacity: 0`.
- [ ] **Step 2:** Run `npm run test:e2e -- site-motion`. Expected: FAIL.
- [ ] **Step 3:** Implement the three sections (port mockup CSS lines 45–80 for caps/lines/pins/shade/rays/dip; replace colour literals with variables).
- [ ] **Step 4:** Run `npm run test:e2e -- site-motion`. Expected: PASS. Take Playwright screenshots of Manor at 1440 and 375 for hero 0%, 30%, 70%, inside, stage and compare by eye with the mockup at the same positions (server from memory file). Fix differences.
- [ ] **Step 5:** Commit `feat(sections): add hero, inside and stage with scroll motion`.

### Task 7: Gallery, Events and Packages sections; shared enquiry state

**Files:**
- Create: `src/sections/gallery/Gallery.tsx` + css, `src/sections/events/Events.tsx` + css, `src/sections/packages/Packages.tsx` + css, `src/sections/shared/enquiry-state.tsx` (client context)
- Modify: `src/modules/site/sections.ts`, `src/modules/site/ui/SiteShell.tsx` (wrap sections in `EnquiryProvider`)
- Test: `tests/unit/packages-view.test.ts`, `tests/e2e/site-packages.spec.ts`

**Interfaces:**
- Produces: `EnquiryProvider`, `useEnquiry(): { eventSlug: string | null; pick: { eventSlug; name; pricePerGuestPaisa; minGuests } | null; guests: number | null; chooseEvent(slug); choosePackage(p) }`. `choosePackage` sets event and pick and raises guests to `minGuests` if lower; changing the event later drops the pick from the message (mockup rule `pick.ev === ev`).
- Gallery: rating card only when `content.gallery.rating`; follow pill only with `contact.instagram` and `followLabel`; two reel rows from `tiles` (row 2 reversed, each repeated twice), skipping tiles with no asset; drift from mockup line 372–373.
- Events: one background per catalogue event that has `mediaKey` with an asset; list, text and "Check a {event} date" switch by progress (`floor(progress × events.length)`); "Check a … date" calls `chooseEvent`; "See packages" selects that event's tab. Events with no packages still show here.
- Packages: tabs = catalogue events that have ≥1 package, in catalogue order (Mehndi first; the mockup listed Barat first, a deliberate change so one order serves Events, Packages and the form); default tab = `defaultEvent` if it has packages, else first. WAI-ARIA tabs: `role=tablist/tab/tabpanel`, `aria-selected`, roving `tabIndex`, ArrowLeft/ArrowRight wrap, Home/End. Card: name, `formatRs` per guest · min N, "From Rs X lakh for N guests" (`t()` templates), items, "Choose <name>" (featured card gets the solid pill). All tabs' panels are server-rendered (hidden ones `hidden`), so prices exist without JavaScript. Offers listed when present. Section left out entirely when no event has packages.

- [ ] **Step 1: Write the failing tests.** `packages-view.test.ts` (`renderToStaticMarkup`): an event with zero packages has no tab; with no packages at all Packages renders `null`; `defaultEvent: "barat"` makes Barat's tab `aria-selected="true"`; Manor Barat Gold card text contains `Rs 4,200` and `From Rs 12.6 lakh for 300 guests`. `site-packages.spec.ts`: focus the selected tab, ArrowRight moves selection and focus to the next tab, ArrowLeft from the first wraps to the last; clicking "Choose Gold" on Barat scrolls to `#contact` and the enquiry preview contains `Package: Gold (Rs 4,200 per guest)`; then choosing event Valima in the form removes the Package line.
- [ ] **Step 2:** Run `npm test -- packages-view` and `npm run test:e2e -- site-packages`. Expected: FAIL (e2e needs Task 8's form; mark the enquiry assertions `test.fixme` until Task 8 Step 4 removes it).
- [ ] **Step 3:** Implement (port mockup CSS lines 81–112).
- [ ] **Step 4:** Run the unit test and the tab e2e. Expected: PASS. Screenshot gallery, events (each event), packages at 1440 and 375; compare with the mockup. Commit `feat(sections): add gallery, events and packages`.

### Task 8: Contact section, full registry, isolation e2e

**Files:**
- Create: `src/sections/contact/Contact.tsx` + `contact.module.css`, `src/sections/contact/EnquiryForm.tsx` (client), `src/sections/contact/LiveHours.tsx` (client), `src/sections/contact/MapEmbed.tsx` (client)
- Modify: `src/modules/site/sections.ts` (type becomes `Record<SectionKey, ComponentType<SectionProps>>`), `tests/e2e/site-packages.spec.ts` (remove `fixme`)
- Test: `tests/e2e/site-contact.spec.ts`, `tests/e2e/site-isolation.spec.ts`

**Interfaces:**
- Consumes: `useEnquiry`, `openStatus`, `todayIn`, `addDays`, `buildEnquiryMessage`, `waLink`, `formatLocalPhone`.
- Form: date (`min = todayIn(tz)`, default `+60` days, server-rendered without a default so no hydration mismatch), name, event chips (catalogue events + `otherEvent`), time chips from `slots` (seeded Lunch, Dinner; default the last), guests range from `content.contact.guests`, live preview (`aria-live="polite"`), "WhatsApp this to {name}" → `waLink(whatsapp, message)` opening in a new tab (left out when no WhatsApp number), "Call {phone}" → `tel:` (left out when no phone). Without JavaScript the call link, address and directions still work.
- Live hours: SSR shows `t("site.checkingHours")`; client fills `openText` or `closedText` with `{time}` = `opensAt`. Hidden when the venue has no opening hours.
- Map: iframe `https://maps.google.com/maps?q=<lat>,<lng>&z=14&output=embed` mounted only when the map card is within one viewport (IntersectionObserver) and with `loading="lazy"`; "Get directions" `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` always rendered. No map location → map block left out, facts and directions-by-address stay.

- [ ] **Step 1: Write the failing e2e.** `site-contact.spec.ts` on Manor: date input `min` equals today in Asia/Karachi (compute in test with `Intl`); filling a past date leaves the field `:invalid`; picking Mehndi, Lunch, guests 250, name "Ayesha" makes the WhatsApp link `href` start with `https://wa.me/923085021418?text=` and decode to the exact message from Task 4's format; call link `href` is `tel:+923085021418` with text "Call 0308 502 1418"; the map iframe is absent at page top and present after scrolling to the map card; "Check a Mehndi date" in Events selects the Mehndi chip. `site-isolation.spec.ts`: on `demo.localhost:3000`, collect every `background-image`, `img src`, `og:image` URL: all contain `/venue-media/<demoId>/` and none contain `<manorId>`; page text has no "Manor", "Ahmed" or "Islamabad"; on Manor no URL contains `<demoId>`. (Read both ids with the service client in the test helper.)
- [ ] **Step 2:** Run `npm run test:e2e -- site-contact site-isolation`. Expected: FAIL.
- [ ] **Step 3:** Implement (port mockup CSS lines 113–152; manager monogram = first letter of `manager.name`).
- [ ] **Step 4:** Make the registry total, remove the `fixme` in `site-packages.spec.ts`, run `npm run test:e2e -- site`. Expected: all PASS.
- [ ] **Step 5:** Run `npm run lint && npm run typecheck && npm test && npm run build`. Commit `feat(sections): add contact with WhatsApp enquiry, live hours and map`.

### Task 9: Visual QA, accessibility and performance pass

**Files:**
- Create: `tests/e2e/site-qa.spec.ts`
- Modify: whichever section/shell files the review finds wrong

- [ ] **Step 1: Write the e2e** `site-qa.spec.ts`: at 320×640 and 375×667 on both venues, after scrolling top to bottom, `document.documentElement.scrollWidth <= innerWidth`; no-WebGL run (`page.addInitScript` making `HTMLCanvasElement.prototype.getContext` return `null` for `webgl2`) shows the hero front shot and all captions; console has no errors on either venue.
- [ ] **Step 2:** Long text: SSR content cannot be swapped per test, so add to `packages-view.test.ts` a render with a 60-character package name and a 3-line caption and assert the card and caption classes carry `overflow-wrap: anywhere` (check the CSS module source); at 320 px confirm by screenshot.
- [ ] **Step 3:** Run both. Expected: PASS after fixes.
- [ ] **Step 4: Human visual review.** Playwright screenshots of both venues at 1440×900 and 375×667 at the same scroll positions as mockup screenshots taken the same way (start the mockup server per the memory note). Review as designer, owner, customer and events manager: blur/pixelation at 100% zoom, gaps or black frames between sections, contrast of captions on the light demo theme, scroll jank. Fix and re-shoot. Save screenshots under `test-results/m2-qa/` (not committed).
- [ ] **Step 5: Lighthouse mobile** on `http://manor.localhost:3000` against `npm run build && npm start`: ask the user before the first `npx lighthouse@12` download, then run `npx lighthouse http://manor.localhost:3000 --preset=perf --form-factor=mobile` and the accessibility category. Record the scores. Targets: performance ≥ 80, accessibility ≥ 95; fix the top findings if below.
- [ ] **Step 6:** Commit `test(site): add QA checks and fix visual review findings`.

### Task 10: Depth parallax on the hero

**Files:**
- Create: `tools/depth.py`, `src/sections/hero/depth/shouldUseDepth.ts`, `src/sections/hero/depth/DepthLayer.tsx` (client, lazy), `src/sections/hero/depth/shader.ts`
- Modify: `src/sections/hero/Hero.tsx` (load layer when `content.hero.mode === "depth"`), `scripts/seed-media.ts` + `media-manifest.ts` (upload `depth.png`, add `'depth'` to sizes), `scripts/seed-data/manor.ts` (`hero.mode: "depth"`), `.gitignore` (`.tools/` already ignored; model lives in `.tools/depth/`)
- Test: `tests/unit/should-use-depth.test.ts`, extend `tests/e2e/site-qa.spec.ts`

**Interfaces:**
- `shouldUseDepth(env: { webgl2: boolean; reducedMotion: boolean; cores: number; saveData: boolean }): boolean` = webgl2 && !reducedMotion && cores ≥ 4 && !saveData.
- `DepthLayer({ image: MediaView, progress: () => number })`: one WebGL2 canvas per hero shot, fragment shader offsets UV by `(depth − 0.5) × strength × (pointer + scroll vector)`; same scale/opacity timeline as the transform fallback; on context loss or shader error it unmounts and the fallback `Shot` shows. Loaded with `next/dynamic` (`ssr: false`) after first paint. Budget: < 30 KB JS for the layer; depth PNG grayscale ≤ 200 KB.
- `tools/depth.py <model.onnx> <out_dir> <images...>`: Depth Anything V2 small ONNX, input 518×518 normalised with ImageNet mean/std, output normalised to 0–255, resized to the image's `m` aspect at 1024 px long side, saved as grayscale PNG `<stem>-depth.png`, warns if > 200 KB.

- [ ] **Step 1: Write the failing test** `should-use-depth.test.ts`: true for `{true,false,8,false}`; false when any one of webgl2 false, reducedMotion true, cores 2, saveData true.
- [ ] **Step 2:** Run `npm test -- should-use-depth`. Expected: FAIL. Implement. Expected: PASS.
- [ ] **Step 3:** `D:/Softwares/Anaconda3/python -m pip install onnxruntime`; download `model.onnx` from the official Depth Anything V2 small ONNX page on Hugging Face (`onnx-community/depth-anything-v2-small`, confirm the file and size ≈100 MB before downloading) to `.tools/depth/`. Write and run `tools/depth.py` on the hero's two shots (`ext-night`, `wide` — the keys the hero content uses). Look at each depth PNG: near objects light, far dark, no banding.
- [ ] **Step 4:** Upload via `npm run db:seed`, implement the layer, set Manor `hero.mode: "depth"`.
- [ ] **Step 5:** Extend `site-qa.spec.ts`: on Manor with WebGL available the hero has a `canvas` and no console errors; with the no-WebGL init script or `reducedMotion: "reduce"` there is no hero canvas and the front shot is visible. Run `npm run test:e2e -- site`. Expected: PASS. Re-shoot hero at 1440 and 375, check by eye that motion is smooth and edges do not tear; check JS size of the layer chunk in `.next` build output.
- [ ] **Step 6:** Commit `feat(hero): add depth parallax layer with offline depth maps`.

### Task 11: Docs, full check and review

**Files:**
- Modify: `docs/ARCHITECTURE.md` ("Where to change what": site content block and schema, site module/registry, motion system and shared helpers, catalogue slice, media slice and seed upload, depth tool; replace the stale `src/app/page.tsx` holding-page row), `docs/ROADMAP.md` (Handoff: M1 merged, M2 state and checks, notes for M3 incl. sample badge and `prices.edit` on price columns), `docs/DECISIONS.md` (content block in settings, CSS Modules ported from mockup, public bucket, noindex while sample, depth as progressive layer), `.env.example`

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `npm run lint && npm run typecheck && npm test && npm run db:seed && npm run test:db && npm run test:e2e && npm run build`. Expected: all pass; record counts.
- [ ] **Step 3:** Commit `docs: update architecture and roadmap for M2`.
- [ ] **Step 4:** Whole-branch code review (per CLAUDE.md) before merge; fix findings; stop for user approval.
