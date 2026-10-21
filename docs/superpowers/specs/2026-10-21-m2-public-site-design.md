# M2 Public Site from Config — Design

Date: 2026-10-21. Status: draft for approval.
Parent spec: `docs/superpowers/specs/2026-10-19-manor-marquee-design.md` (§5 public website, §13 media, §14 visual system, §15 technical direction). Roadmap: `docs/ROADMAP.md` M2.

## 1. Intent

Turn the approved mockup v6 (`.superpowers/brainstorm/1089-1792319084/content/public-site-v6.html`) into the real public site of each venue. The page must look and move like the mockup for The Manor, and every word, photo, colour, price, number and link must come from the venue's own data, so a second venue gets its own site with no code change. The site must help the venue get business before booking and payments exist: visitors can call the manager, send a ready WhatsApp enquiry, and see packages with prices.

## 2. Goals

- Manor's site at `manor.localhost:3000` matches mockup v6 at 1440 and 375 widths: same sections, order, captions, effects, type scale and behaviour (parent spec §5).
- The demo hall at `demo.localhost:3000` renders the same sections with its own data and the platform default theme, with no code change.
- Section order and visibility come from `tenant_settings.sections` (already in the schema).
- Theme (colours, fonts, logo) comes from tenant settings and becomes CSS variables; no colour or font is hard-coded in a section.
- Contact actions work for real: call button (`tel:`), WhatsApp enquiry builder writing a ready message (`wa.me`), live Open/Closed in the venue time zone, map with directions.
- Packages show per event with per-guest price, minimum guests and "From Rs X lakh for N guests". "Choose <package>" fills the enquiry.
- Depth parallax 3D effect on the hero (see §6) as a progressive enhancement.
- Paused venue holding page: noindex, honest copy. Unknown host: platform 404.
- SEO: per-venue title, description, Open Graph image, canonical, and schema.org `EventVenue` JSON-LD from venue data. Private pages stay noindex (already true).

## 3. Non-goals (later milestones)

- Booking, holds, the live date-and-price calendar, quotes (M4); payments (M5).
- Catalogue editing screens and media upload UI (M3). In M2 the data is seeded; the manager edits it in M3.
- Stage theme preview (M8), digital invite (M8), hall detail pages, full menu page, FAQ, policies (later; reuse these components).
- Urdu (structure stays ready via `t()`; copy lives in venue data).
- Drone fly-in hero from video (when the owner's footage arrives; see §6.3).

## 4. Anti-goals (failure even if it "works")

- Made-up content presented as final: sample prices, menus, offers and the manager name are seeded as data and flagged `sample: true`; the admin shows a "sample content" badge (parent spec §5 rule). They are never hard-coded in components.
- Dead buttons: any button for a feature not built yet is hidden, not disabled. "See stage themes" is hidden until M8.
- Black or blank screens between sections, boxed photos, heavy full-screen darkening, stutter from video seeking (parent spec §5 rules).
- Site breaks without WebGL, with reduced motion, or on a slow phone.
- One venue's data, photos or theme ever shown on another venue's host.

## 5. Decided

User decisions (2026-10-21):
- Before booking exists, visitors can call the manager, message on WhatsApp, and see packages.
- Prices: seed sample prices now; the manager changes them later (M3 screens).
- 3D: do it now if possible with current photos; the owner sends more photos and videos later.

Carried from earlier approvals: mockup v6 sections, order, captions and rules (parent spec §5); Manor theme tokens and fonts (parent spec §14); image size picking by long side × DPR (≤1400 small, ≤2200 medium, else large); full-screen only from sources ≥1600 px; pre-rendered images and transforms, never `video.currentTime`.

## 6. 3D on the hero (depth parallax)

### 6.1 What it is
Real 3D camera moves need drone or gimbal footage or a 3D scan, which we don't have yet. With current photos we can do depth parallax: a depth image is made offline for each hero photo (how far each pixel is), and a small WebGL shader shifts near and far parts by different amounts as the visitor scrolls and moves the pointer, so the facade and hall photos move with real depth during the push-in.

### 6.2 Rules
- Progressive enhancement only. Loaded lazily after first paint, only when WebGL2 is available, `prefers-reduced-motion` is not set, and the device is not low-power (`navigator.hardwareConcurrency` ≥ 4 and no `saveData`). Otherwise the approved mockup transform effect runs unchanged.
- Same captions, timing and scroll positions as the mockup; the shader replaces only how the photo moves.
- Depth images are produced offline by a local depth-estimation model (Depth Anything V2 small, ONNX, about 100 MB, from its official Hugging Face page), run with the existing Anaconda Python plus `onnxruntime` (pip). Stored next to the photo variants and listed in the media manifest. User approved the install and download (2026-10-21).
- No new runtime dependency: plain WebGL2 and one fragment shader. Three.js stays reserved for a later panorama or 3D tour (parent spec §15).
- Budget: the 3D layer adds under 30 KB of JS plus one depth image per hero photo (grayscale, ≤200 KB each).

### 6.3 Later: drone fly-in
When the owner's footage arrives, the hero becomes the scroll-scrubbed fly-in from `references/visual-reference-2.mp4`'s pattern: footage pre-rendered to an image sequence drawn on a canvas. The hero section reads a `heroMode` setting (`photos` | `depth` | `sequence`) so switching is a settings change.

## 7. Data

- **Settings:** existing `tenant_settings` blocks (identity, theme, sections, messaging, money rules) hold copy, colours, fonts, logo, section order and visibility, manager card, phone and WhatsApp numbers, opening hours, address and map coordinates, social links, Google rating. Extend the Zod schemas where the mockup needs fields they lack (for example per-section captions and the hero mode); keep tenants columns as owners of limits, currency and time zone.
- **Catalogue (minimal M2 slice):** add tables `event_types`, `packages`, `offers` (tenant-scoped, RLS, negative tests) with only the fields the Events and Packages sections need, plus a `sample boolean`. M3 extends these tables; it does not replace them. Public read goes through a server-side query for the resolved tenant; anon gets no direct table access.
- **Media:** a Supabase Storage bucket for venue media, path `<tenant_id>/<asset>/<size>.jpg` (and `depth.png`), and a `media_assets` table (tenant, key, alt text, category, source, licence, sizes present). Manor's processed images from the mockup content folder are uploaded by a local-only seed step (same guard as `scripts/seed-users.ts`). The demo hall uses neutral demo images under the platform look.
- **Seeds:** Manor gets the mockup's content and sample packages and prices (flagged sample). Demo hall gets short demo content.
- **Contact numbers:** WhatsApp and call use the user's test number 923085021418 as seed data until the manager's real number is provided; it is venue data, so swapping it is a settings change.

## 8. Structure

- One folder per section under `src/sections/<section>/` (hero, inside, stage, gallery, events, packages, contact, footer), each a component fed by a typed section prop built from venue data. A registry in `src/modules/site/` maps section keys to components and renders them in settings order.
- One shared scroll/motion system (smoothed progress per pinned section), matching the mockup. Reduced motion: all effects off, all text visible.
- Public page server-renders the venue's content so it works without JavaScript for reading and calling; scroll effects and the enquiry builder hydrate on top.
- Update `docs/ARCHITECTURE.md` "Where to change what" for sections, the registry, motion, media and the catalogue slice.

## 9. Acceptance and checks

- Playwright screenshots of both venues at 1440 and 375; Manor compared against mockup v6 screenshots taken the same way.
- Reduced-motion run: every caption visible, no motion.
- No-WebGL run: page complete, hero uses the approved fallback.
- Enquiry builder: past dates blocked, message text correct, `wa.me` link built with the venue number.
- Packages tabs: keyboard (arrow keys) and screen-reader roles.
- Tenant isolation: Manor's assets and data never appear on `demo.localhost`; unknown host → 404; paused venue → holding page with noindex.
- Lighthouse mobile run on Manor, result reported (target: performance ≥ 80, accessibility ≥ 95).

## 10. Settled after the builder check (my calls unless marked)

- **Where M2 runs:** local only (`*.localhost`). Hosting is chosen in M10. Canonical, Open Graph and JSON-LD URLs use the venue's primary domain from `tenant_domains`, so they are right once hosted.
- **Sample content on public pages:** a venue site is `noindex` while any of its content is still flagged `sample`. No visible sample marker on the public page (it is local only in M2); before launch the owner's real data clears the flags.
- **Status `setup`:** the full site renders with `noindex` and a thin "Preview, not open yet" bar (via `t()`). `live` renders normally. `paused` shows the holding page (noindex). Unknown host gives the platform 404.
- **Media bucket:** public-read Storage bucket for venue site images (they are public on the site anyway), plain cacheable URLs. Writes only from the server or the local seed step. The isolation test checks that a venue page only references its own `<tenant_id>/` paths.
- **Mockup comparison:** human visual review of Playwright screenshots at 1440 and 375 against the mockup at the same scroll positions, not a pixel-diff threshold.
- **Site texts:** a `content` block in tenant settings, one typed entry per section (captions, labels, stage line, event descriptions, manager card, fine print, rating), validated by Zod. Manor's strings come verbatim from mockup v6. Demo hall gets short neutral copy written by the builder.
- **Demo hall images:** neutral generated images (soft gradients with simple shapes, made by a small script), stored in the bucket under the demo tenant. No Manor photos on the demo hall.
- **Google rating:** 4.5 stars from 829 reviews is real data for Manor (Google, checked 2026-10-19), stored in content with its source and date. Not sample.
- **Depth tooling:** the 3D layer is the last task of M2 and is separable. Depth maps for the hero's two push-in photos (night facade, wide hall). If the download is declined, M2 ships on the approved fallback and `heroMode: 'depth'` stays in the schema unused.
- **Map:** keep the mockup's map embed, loaded lazily (`loading="lazy"`, only near the viewport), with the "Find us" card and a plain directions link that works without it.
- **Sample badge:** M2 adds only the `sample` column on catalogue rows and content; the admin badge comes with the M3 catalogue screens.

## 11. Left to the builder

Component internals, the exact shader math, how the motion system is split into files, test file layout, image upload script details, and the exact extra settings fields, as long as they follow the rules above and the module boundary rule.
