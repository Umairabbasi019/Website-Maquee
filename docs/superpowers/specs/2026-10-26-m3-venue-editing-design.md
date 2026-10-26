# M3 Venue editing and catalogue: design

Date: 2026-10-26. Status: draft for approval.
Roadmap row: M3 "Venue configuration and catalogue" (docs/ROADMAP.md). Builds on M1 (access, tenants) and M2 (public site from config).

## 1. Intent

The venue's own manager keeps the public site's real offer up to date without the platform owner or a developer: package prices, menu items, decor themes and their prices, offers, contact details and opening hours, photos. Today all of this is seed data marked `sample`. When M3 ships, the Manor manager replaces it with real data and the site can be indexed.

The look of the site (background photos, hero, colours, fonts, logo, section order) and the money rules stay with the super admin (the platform owner).

Success: a manager changes the Gold Barat price and adds a menu item on a laptop, presses Publish, and the public site shows it. A visitor sees nothing until Publish. The change is in the audit log with the manager's name.

## 2. Decisions made with the user

| Topic | Decision |
|---|---|
| Editing style | Edit on the page (mockup option B): the editor shows the real venue site with ✎ buttons on the things this person may change. A click opens a small editor in place. |
| Going live | Changes are a draft. The public site changes only when someone presses **Publish**. |
| Manager may change | Package prices, menu items, decor (stage) themes and their prices, offers, phone numbers, opening hours, event descriptions, gallery photos, decor theme photos. |
| Super admin only | Background photos of sections, hero, colours, fonts, logo, which sections show and their order, venue name, tax rule, advance rule, and every other money rule (hold length, instant booking, payment methods). Also the WhatsApp number, map location, social links and Google review link. |
| Image tool | `sharp` on the server. |
| Devices | Editor works on phone and laptop but is designed laptop-first (the manager mostly uses a laptop). The public site stays phone-first (customers mostly use phones); the editor can preview the page at phone width. |
| Things that never show on the page | A plain settings screen in the dashboard for them (see §4.4). |
| Role-based ✎ | Each person only sees ✎ buttons for what their permissions allow. Hidden is not the protection: every save and publish is checked again on the server and by RLS. |
| Audit | Every publish (and every super-admin-only change) is in the audit log: who, when, what changed. |
| Photo sizes | Uploaded photos get small, medium and large sizes made automatically, with their pixel sizes stored, so the site stays fast. |

## 3. Goals, non-goals, anti-goals

Goals
- On-page editor with draft and Publish for everything in the "manager may change" row.
- New catalogue pieces the public site and M4 pricing need: add-ons, stage themes, date prices.
- Media library: upload, replace, alt text, delete unused; size variants with `dims`.
- Super admin edits any venue through the same editor plus the super-admin-only parts.
- Sample flags (my call): catalogue rows clear their own `sample` flag when edited and published. The site-wide `content.sample` flag covers super-admin copy, so the super admin clears it with an explicit "Content is real" action in the editor. Dashboard badge lists what is still sample; public site stays noindex until no sample rows and `content.sample` is false (rule already in M2). Success for the manager = their rows are real; indexing also needs the super admin's action.

Non-goals (later milestones)
- Booking, quotes, availability, the live date calendar (M4). M3 only stores date prices; M4's pricing service reads them.
- "See stage themes" customer preview page (M8). M3 stores themes with photos and prices; the public Stage section may list them only if cheap (builder's call, see §7).
- Users and permissions screens, audit log screen (M6). M3 writes audit events; viewing them stays in the database or a minimal list if cheap.
- Urdu content, version history beyond "discard draft", scheduled publishing, AI image work, depth map generation in the browser or server.

Anti-goals (would be a failure even if it works)
- A visitor sees a half-edited site (draft leaks, or a publish applies only part of the changes).
- A manager can change tax, advance, theme or backgrounds by calling the API directly, or edit another venue.
- A price stored as a float or rupees, or a published price that differs from what was previewed.
- A photo upload that writes a path outside `<tenant_id>/`, or a site that 404s because stored settings fail validation after an edit.
- The public site gets slower or loses its no-JS, reduced-motion or no-WebGL behaviour because of editor code. Editor code must not ship to public visitors.

## 4. What gets built

### 4.1 The editor

- Route: `/dashboard/site` (new screen "Edit site" in `DASHBOARD_SCREENS`), private, noindex, behind the normal dashboard sign-in. It renders the venue's site sections from the **draft** view, with an editor bar on top: unpublished change count, phone/laptop preview width toggle, Discard draft, Publish.
- ✎ targets (manager, given the keys in §5): each package (name, price per guest, minimum guests, menu items list with add/remove/reorder, featured), adding and removing packages, event type description and its background (background = super admin only), offers (add/edit/hide/remove), contact phones, opening hours, address text, manager name/role on the contact card, gallery tiles (pick or upload a photo, order, add/remove), stage themes (§4.2).
- Super admin additionally gets ✎ on: section backgrounds and hero photos, all section copy, theme colours and fonts, logo, section visibility and order, venue name.
- Small editors open in place (popover or side panel, builder's call) with clear labels, inline validation messages, and Save to draft. Prices are entered in rupees and stored in paisa.
- Accessible: every ✎ is a real button with a label ("Edit Gold package"), keyboard reachable, focus returns after closing, editor panels work at 375px.
- The public route keeps rendering from published data only and loads no editor code.

### 4.2 New catalogue data

All money is integer paisa. Every table has `tenant_id`, RLS, a `sample` flag where seed data exists, and negative tests.
- **Add-ons**: name, price (flat or per guest), active, sort. Shown under packages on the site only if any exist (builder's call on layout, match mockup style).
- **Stage themes**: name, short description, price (flat), photos (media keys), active, sort.
- **Date prices**: a date range or a single date, optional event type, an adjustment (percent up or down, or a fixed per-guest amount), label ("Wedding season", "Weekday discount"). Stored and validated now; applied by M4 pricing. Overlap rule: builder's call, documented and tested.
- Menus stay as the package's `items` list (already in the schema). No separate menus table in M3.
- **Hall hire price** (my call): `halls` gains an optional hall hire price (paisa), editable with `prices.edit`, so M4 pricing (REQUIREMENTS PRC-2) needs no schema change. Halls themselves stay super admin only.
- **Offer discounts** (my call): `offers` gains an optional discount (percent or fixed paisa) and optional date range, editable with `prices.edit`. Text-only offers stay valid. M4 applies them.
- **Event types** (my call): a manager with `catalogue.edit` may add, rename, describe, reorder and remove event types. A new event type has no background until the super admin sets one; the Events section already renders without one. Removing the event named in `packages.defaultEvent` clears that setting.

### 4.3 Draft and Publish

Behaviour (the builder picks the mechanism):
- One draft per venue, shared by everyone who edits that venue. The editor shows who last changed each item.
- Saving writes only to the draft. The public site, its metadata and JSON-LD read only published data.
- Publish applies the whole draft in one database transaction, re-validates everything with the Zod schemas and permission checks at publish time, writes one audit event with a readable diff, and then refreshes the public page cache for that venue.
- If two people publish at once, one wins and the other sees "the site changed, review and publish again"; nothing is half-applied.
- Discard draft returns the draft to the published state. Undo of a single change is a nice-to-have.
- A change that only the super admin may make, saved by the super admin, still goes through draft and Publish.

### 4.4 Settings screen (things not on the page)

`/dashboard/settings`, plain forms:
- Halls (name, capacity min/max, active) and slots (name, start, end, buffer): super admin only (current RLS already requires `tenant.settings.edit`, which managers do not have).
- Date prices: key `calendar.manage` (its matrix meaning is "block dates, hold dates, date pricing"); table and service live in the `calendar` module per ARCHITECTURE, imported by M4 through its `index.ts`.
- Money rules (tax, advance, hold hours, instant booking, payment methods): super admin only.
- Feature switches and limits stay in the existing `/admin/tenants/[id]` console.
- These save directly (no draft), audited, because they do not change the page's look. Exception: if a date price is shown on the public site, it follows Publish. Builder's call; state it in the plan.

### 4.5 Media library

- `/dashboard/media`: grid of the venue's photos with alt text, where each is used, upload, replace, edit alt text, delete (only when unused).
- Upload: JPEG, PNG or WebP only, size limit (builder's call, e.g. 15 MB), checked by content not just extension. Server makes s/m/l variants, writes `media_assets.dims` for every size (M2 contract), stores at `<tenant_id>/<key>/<size>.<ext>` using the existing key and ext constraints. Writes use the service role on the server after `can(media.manage)`; the bucket stays service-role-write only.
- Alt text is required before a photo can be published on the site.
- Depth maps: no in-app generation. When the super admin replaces a hero photo and the hero mode is `depth`, the editor asks for a matching `depth.png` (made offline with `tools/depth.py`) or switches that hero to `photos`. The site must never show a depth layer for a photo whose depth map does not match.
- Image processing: `sharp`, added as a direct dependency (user approved 2026-10-26; already in the lockfile via Next). Variants and `dims` are made on the server; browser-sent sizes are never trusted.

## 5. Permissions

Existing keys and what they cover in M3:
- `catalogue.edit`: event types, packages (non-price fields), menu items, offers, add-ons, stage themes, gallery tiles.
- `prices.edit`: every price column (package price per guest, add-on price, stage theme price, hall hire price, offer discount).
- `calendar.manage`: date prices. Enforce on columns, not just in the UI (RLS or a trigger that rejects price changes without the key).
- `media.manage`: upload, replace, alt text, delete.
- `tenant.settings.edit`: halls, slots, money rules, theme, sections, backgrounds, venue name. Not granted to owner or manager roles by default, so in practice super admin only. Keep it that way.
- New key needed: contact details and opening hours (part of `tenant_settings.identity`) are manager-editable but `tenant.settings.edit` is super-admin-only. Add a key such as `venue.info.edit` (manager and owner by default) covering exactly: phones, opening hours, address text, manager card. The WhatsApp number, map location, Instagram and Facebook links, Google review link, gallery rating and map facts are super admin only (user decision 2026-10-26). Update `PERMISSIONS`, the access migration rows, docs/JOURNEYS.md matrix.
- Publish requires the union of keys for what is in the draft: a manager cannot publish a draft that contains a super-admin-only change made by someone else unless they hold that key. Builder's call on the exact rule; it must be tested.

## 6. Constraints

- Project invariants in CLAUDE.md: tenant ID only from the proxy/session, never the browser; server `can()` plus RLS on every table; negative tests; integer paisa; no fake states; public site works without WebGL/JS and respects reduced motion; private pages noindex.
- Settings written by the editor are validated with the same Zod schemas the site reads (`TenantSettingsSchema`, https-only URLs). A save that fails validation is refused with a message; it never reaches the published row.
- Module rules: change one module at a time where possible, import other modules only through `index.ts`, update the ARCHITECTURE "Where to change what" table.
- M1 carry-overs that must land before M3 adds writes: guard `/dashboard?tenant=` (honour only `Sec-Fetch-Site` same-origin/none); decide how direct PostgREST writes are audited (trigger or server-only writes).
- Stack: Next.js 16 App Router (cacheComponents), Supabase local, Zod 4, Playwright, Vitest. No new dependency without asking.

## 7. Left to the builder

- Draft storage mechanism (draft tables, a JSON draft per venue, or shadow rows) and the publish transaction.
- Popover vs side panel for the small editors; the editor bar layout.
- Whether the public Stage section lists stage themes in M3.
- Add-on layout on the public Packages section, matching the approved M2 design.
- Date price overlap rule.
- Upload size limit and variant widths (keep the M2 s/m/l scheme).
- Whether the audit log gets a minimal read-only list in M3.

## 8. Tests expected

- Zod schema tests for every new shape; price in paisa round-trips from a rupee input.
- RLS negative tests for each new table and the new key: anon, other tenant, staff, accounts, manager without `prices.edit` changing a price.
- Draft isolation: a saved but unpublished change never appears on the public page, metadata or JSON-LD.
- Publish is atomic and audited; concurrent publish test.
- Manager cannot change tax, advance, theme, backgrounds, sections or venue name by direct API call.
- Media upload Playwright test (upload, variants and dims written, appears on the site after Publish); rejects a non-image and a wrong-tenant path.
- Playwright journey: manager edits Gold Barat price and adds a menu item on a laptop viewport, previews at phone width, publishes, public site shows it.
- Public site e2e from M2 stays green (no-JS, reduced motion, no WebGL, 320/375 edge checks).

## 9. Carry-overs from M2 to handle or note

- Media upload writes `dims` for every size; `depth.png` per §4.5.
- Sample badge in the dashboard; real edits clear `sample` on the edited row.
- Guests clamp: a package whose minimum guests exceeds the contact form maximum must be refused or flagged at save.
- PackageTabs: tabpanel role without JS and the skipped heading level (minor a11y, fix while touching Packages).
- `tenant_domains.is_primary` has no UI; the admin console may add it (small) or it stays SQL-only.
- `src/ui/tokens.css` platform defaults still use the old demo colours; align with the template while touching the theme.
