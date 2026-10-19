# Marquee Booking Platform: Design Spec (first tenant: The Manor Marquee)

Date: 2026-10-19
Status: approved by the user on 2026-10-19 (v3 + built-for-change rule)
Inputs: `marquee_claude_master_prompt.md`, `CLAUDE_marquee_project.md`, the approved public-site mockup (`.superpowers/brainstorm/1089-1792319084/content/public-site-v6.html`), and brainstorming answers from 2026-10-18 and 2026-10-19.

## 1. What we are building

A multi-tenant booking and operations platform for wedding marquees and event venues in Pakistan. Each venue gets a cinematic public website and an operations dashboard. The first venue is The Manor Marquee, Islamabad Expressway. The owner is a relative of the platform owner and approved use of all venue photos and videos. After launch, the platform owner sells the same product to other marquees.

The product has to fix a real problem. Google reviews (4.5 stars, 829 reviews) praise the venue, food and decor but complain about management and service. Today, bookings and payments run on a Google Sheet kept by an accounts operator. The platform replaces that sheet with a booking flow, a calendar and verified payments, and gives customers the details they need (menus, prices, packages, offers, a manager to contact) without having to call.

## 2. Decisions confirmed by the user

| Topic | Decision | Date |
|---|---|---|
| Language | English at launch. Build so Urdu can be added later without a redesign (strings in a locale layer, no text baked into images). | 2026-10-19 |
| Advance payment | Two ways to pay (§8). Online: when the payment provider confirms the money, the date is booked automatically, with no staff step. Manual: bank transfer, JazzCash or Easypaisa with a receipt upload, and staff confirm the money arrived. The bank or gateway API is connected later; the design is ready for it now. | 2026-10-19 |
| Who manages what | The super admin (platform owner) is the only user who can manage everything, across all venues. Every other user sees only their own venue and only the screens their permissions allow. | 2026-10-19 |
| Multi-tenant | The same app serves many marquees. Each venue is a tenant with its own domain, branding, content, prices, users, payment accounts, WhatsApp number and data. Adding a new marquee is configuration, never code. | 2026-10-19 |
| Video | Launch with the photo-based cinematic site. Swap in the owner's original drone and gimbal footage when it arrives. | 2026-10-19 |
| Tenants | The platform owner (super admin) creates each venue and gives it its own domain address. No self sign-up. | 2026-10-19 |
| Billing for tenants | Not decided. Outside the MVP; tenants are invoiced outside the system for now. | 2026-10-19 |
| Defaults | PKR and Asia/Karachi, configurable per venue. | 2026-10-18 |
| Notifications | WhatsApp first, email as backup. | 2026-10-18 |
| Owner/staff dashboard | Part of the MVP. Designed after the public site. | 2026-10-19 |
| Public site look | Section-by-section mockup approved: Hero, Inside, Stage, Gallery, Events, Packages, Contact, Footer. | 2026-10-18 to 2026-10-19 |
| Test WhatsApp number | 0308 502 1418 (platform owner) until the manager's real number is confirmed. | 2026-10-19 |
| Super admin control | The super admin can change everything for any venue: name, theme, backgrounds, media, menus, packages, prices, offers, users. Every change is audited. | 2026-10-19 |
| Venue managers | Each venue gets 1–2 manager logins with full control inside their own venue: all reservations, menus, prices, offers, calendar. | 2026-10-19 |
| Hosting | Decide before launch. Build so the app runs on managed cloud (Vercel + Supabase) or on one VPS without code changes. | 2026-10-19 |
| Unique features | All proposed customer and owner features are in the MVP (§10), plus automatic marketing (§11). | 2026-10-19 |

## 3. Tenancy and domains

- Hierarchy: platform → account (organisation) → venue → halls. The Manor group has sister venues (Noor Mahal, The Noir, Gold Canyon, Grandure), so one account can hold several venues.
- The super admin creates the account and venue, then attaches a domain. Each venue resolves from its custom domain. A platform address (for example `venue-slug.<platform-domain>`) also exists for setup and preview before DNS is ready.
- The domain only selects which public site to show. Authorisation never trusts a tenant ID from the browser. It comes from the signed-in user's memberships, enforced on the server and through Postgres row-level security.
- Every tenant-owned row carries `tenant_id`. Negative tests prove one venue cannot read another venue's records.
- Media files are stored under a per-tenant path, and storage rules enforce the same isolation as the database.

### What each tenant configures (no code changes)

| Area | Per-tenant setting |
|---|---|
| Identity | Name, logo, tagline, domain, contact numbers, address, map location, opening hours, social links, Google review link. |
| Look | Theme colours, fonts, hero and section photos, captions, which public sections are shown and in what order. |
| Venue | Halls with capacities, slots (lunch, dinner), event types, packages, menus, add-ons, stage themes, offers. |
| Money | Currency, tax rule, advance rule, date pricing, hold length, instant booking on or off, payment methods and the venue's own receiving accounts (bank, JazzCash, Easypaisa, later gateway keys). Money always goes to the venue's accounts, never through the platform. |
| Messaging | The venue's WhatsApp Business number and templates, reminder timings, morning summary time, marketing caps. |
| Features | Feature switches per tenant (for example stage preview, invites, marketing, run sheet), so the super admin can sell different plans later without code changes. |
| Users | Number of user logins allowed, and each user's permissions. |

### Super admin console

- List of all tenants with status (setup, live, paused), domain health, last activity and message usage.
- Create a tenant from a template: copy the default sections, event types and sample packages, then replace them with the venue's real data. A setup checklist shows what is still missing (domain, numbers, prices, photos, payment accounts).
- Open any tenant and change anything in it. The console makes it clear which tenant is being edited, and every change goes to that tenant's audit log under the super admin's name.
- Pause a tenant (public site shows a holding page, logins blocked, data kept). Export a tenant's data (bookings, customers, payments as CSV) for offboarding.
- Secrets per tenant (payment and WhatsApp keys) are stored encrypted on the server and never shown again after saving.

## 4. Roles

One super admin manages everything. Every other user has a specific view: their own venue only, and only the screens their permissions allow.

| Role | Sees and can do |
|---|---|
| Super admin (platform owner) | Everything, across all venues: the super admin console (§3), every tenant's settings, content, prices, users, bookings, payments, reports and audit logs. The only role that can create, pause or delete tenants, set domains, switch features on or off, and set how many logins a venue gets. |
| Venue owner | Their own venue (or the venues in their account): everything a manager sees, plus all reports and charts. User management only if the super admin allows it. |
| Manager (default 2 per venue) | Their own venue: all reservations and the calendar, enquiries, quotes, menus, packages, prices, offers, payments, run sheets, marketing. No platform settings, no other venues, no user management unless allowed. |
| Accounts (optional) | Their own venue: payments, receipts, ledger and payment reports only. |
| Staff (optional) | Their own duty schedule and the run sheets for events they work on. |
| Customer | No account or password. A private, expiring, unguessable booking link shows only their own booking: status, quote, payments, invite and final details. |

How views work:
- A role is a named set of permissions (for example `bookings.view`, `bookings.edit`, `prices.edit`, `payments.verify`, `users.manage`, `marketing.send`). The super admin can change any user's permissions, one by one, on top of their role.
- The dashboard shows only the screens and buttons a user is allowed to use. Hidden is not the protection: every action is checked again on the server and through row-level security.
- The super admin can deactivate a user at once. Their sessions end and their name stays on past audit entries.
- Every change by a signed-in user, including the super admin, is written to the audit log under their name.

## 5. Public website (approved mockup)

One long cinematic page per venue, built from venue configuration, not code. The section layout and effects are shared by all tenants. The captions, photos, events and packages below are The Manor's content and change per tenant. Order and behaviour as approved:

1. **Hero:** night facade push-in toward the doors, zoom through to the wide hall. Captions: "Not just a venue, but an experience" → "Step inside" → "A thousand lights, one night". Buttons: Check a date, Take the tour.
2. **Inside:** three rooms crossfade with a sideways pan, one label at a time (Floral entrance, A sky of crystal, Room for every family).
3. **Stage:** soft circle reveal of the stage. Photo dims when the caption appears: "Your moment, centre stage", line about the stage theme, button See stage themes.
4. **Gallery:** "Real events, right here", two photo rows drifting in opposite directions, 4.5-star Google rating with a true half star, Follow on Instagram.
5. **Events:** pinned section. Mehndi, Barat, Valima, Nikkah and Corporate swap the background photo and description. Button "Check a <event> date" pre-fills that event in the enquiry. "See packages" opens that event's tab.
6. **Packages:** event tabs (accessible tab pattern, arrow keys), three packages per event with per-guest price, minimum guests and "From Rs X lakh for N guests". "Choose <package>" fills event, package and minimum guests into the enquiry. Offers row. Fine print: the final quote confirms tax and date-based pricing.
7. **Contact:** live Open/Closed in Asia/Karachi, enquiry builder (date with no past dates, name, event, lunch or dinner, guests) that writes a ready WhatsApp message, call button, manager card, map with a "Find us" card and directions.
8. **Footer:** address, section links, Instagram, copyright, large faint wordmark.

Rules carried from the mockup review:
- Photos fill the screen edge to edge with soft masks, no boxed images. No blank or black screens between sections.
- Full-screen photos only from sources at least 1600 px on the long side. Small sources (Instagram, website thumbnails) only as gallery tiles.
- The page picks an image size by the screen's long side × pixel ratio: up to 1400 small, up to 2200 medium, else large.
- Scroll effects use pre-rendered images and transforms, never `video.currentTime` seeking (it stutters).
- Type scale: display 38–88 px, section sub-heads 30–52 px, body 17 px on laptop; on phone 34–44, 28–36 and 16 px.
- Text over photos uses a layered shadow plus a local gradient, never heavy full-screen darkening.
- Reduced motion: all effects become static, all text visible.
- Everything on the page that reads like a real offer (prices, menus, offers, manager name) is sample content until the owner provides real data, and it is labelled that way in the admin.

Later public pages from the master prompt (hall detail pages, full menu page, decor catalogue, FAQ, policies) reuse the same components. They are planned in the roadmap, not designed yet.

## 6. Customer booking flow

The mockup's WhatsApp enquiry is the launch fallback. The full flow, reconfirmed from 2026-10-18:

1. Customer picks a date → event type → guest count → package. A live itemised estimate shows the advance due.
2. "Reserve this date" asks for name, phone and WhatsApp consent. No account or password.
3. The date is held for 48 hours (configurable per venue).
4. The customer gets a WhatsApp message and a private booking link (status, quote, payments, final details).
5. The manager gets an instant WhatsApp alert with one-tap call and WhatsApp.
6. The manager finalises the quote (or the customer accepts the standard package price, if the venue allows instant booking). The customer pays the advance from the booking link:
   - **Online** (once the bank or gateway API is connected): the provider confirms the payment to our server, and the booking becomes Confirmed automatically. No staff step.
   - **Manual** (available from day one): bank transfer, JazzCash or Easypaisa, then a receipt upload. The manager or Accounts checks that the money arrived and marks it verified, and the booking becomes Confirmed. **A receipt alone never confirms a booking.**
7. Confirmed sends a WhatsApp confirmation to the customer and the manager, blocks the date on the calendar and the public date calendar, and starts automatic reminders for the balance, final guest count and menu lock. The balance can be paid the same two ways.

Statuses: Inquiry → Held → Quote prepared → Awaiting advance → Confirmed → Planning → Ready → Completed, with Declined, Cancelled, Hold expired, Refund pending and Refunded as outcomes. One server-side service controls transitions and records who, when and why.

Double booking is prevented in the database (exclusion constraint or locking on hall + time range), not only in the UI. Holds expire on the server.

## 7. Pricing

- One server-side pricing service with tests. The browser never sends a total that is trusted.
- Inputs: hall hire, per-guest package price × guests, add-ons, decor, date pricing (peak, wedding season, discount days), offers, tax (configurable per venue), advance (fixed or percentage).
- Money stored as integer paisa (minor units). Rounding rule stated in the pricing module.
- An agreed quote is saved as an immutable snapshot on the booking. Staff overrides need a reason and go to the audit log.

## 8. Payments

- **Manual payments (MVP, day one):** bank transfer, JazzCash, Easypaisa with receipt upload and staff verification. Staff verification books the date.
- **Online payments (designed now, connected later):** one payment-provider interface (`createPayment`, `verifyWebhook`, `getStatus`, `refund`). The first real provider is the bank API or a Pakistani gateway (for example the bank's own payment API, JazzCash/Easypaisa merchant APIs or Safepay), chosen when the user has the merchant account. Adding it means writing one adapter and entering the venue's keys in the super admin console. Booking logic does not change.
- **Auto-booking rule:** a booking becomes Confirmed automatically only when the server receives a payment confirmation from the provider that passes signature check, matches the booking, the amount and the currency, and is not a repeat. The browser's "payment successful" page never confirms anything by itself. If a confirmation is missed, the server asks the provider for the status.
- **Same date, two payers:** only the customer holding the date can pay for it. If money arrives after the hold expired and someone else has booked the date, the payment is recorded, the booking is not confirmed, the status becomes Refund pending, and the manager is alerted.
- **Bank statement matching (later, with the bank API):** incoming transfers can be matched to bookings by reference code, so manual transfers also confirm without staff when the match is exact. Unclear matches go to staff.
- Each venue receives money in its own accounts. Keys are per tenant and stored encrypted.
- Ledger per booking: advance, balance, refunds and adjustments, with the method, provider reference and who or what recorded each entry (a staff member's name or "payment provider").

## 9. Notifications

- Click-to-WhatsApp works with no provider (mockup behaviour).
- WhatsApp Business Cloud API (or an approved provider) behind an adapter, with opt-in tracking, approved templates, delivery status and retry records. Email adapter as backup.
- States shown honestly: recorded, queued, accepted by provider, delivered, failed. Nothing is shown as sent when no provider is connected.
- Reminders run on a schedule in the venue's time zone, with duplicate-send protection.

## 10. Unique features (all in MVP)

These are what set the product apart when selling to other marquees.

### For customers

1. **Live date and price calendar.** The public site shows which dates are free, held or booked (no customer details) and the price for each free date, including peak and discount days. Tapping a free date starts the booking flow with that date filled in. "Special price" badges come from the marketing offers in §11.
2. **Shareable family quote.** One tap sends a WhatsApp link to a clean, read-only quote page: event, date, package, itemised price, advance, what is included, venue photos and a "Reserve this date" button. The link is unguessable, expires with the quote, shows no phone numbers and is never indexed.
3. **Stage theme preview.** The customer picks a stage theme and sees it on a photo of the venue's real stage, with its price. MVP previews are real photos of past setups on that stage, or composites made offline from them, labelled "illustration". No live AI image generation. Depends on the owner sharing theme photos.
4. **Digital invite and RSVP.** After the booking is confirmed, the family gets an invite page: names, event, date and time, venue photos, map and directions, and an RSVP form (name, number of guests). The family sees live RSVP totals, which also helps the final guest count. Venue branding on the invite works as free advertising. The page is unlisted, never indexed, editable by the family through their booking link, and expires after the event.

### For owners and managers

1. **Clear booking overview.** One calendar and list that shows every reserved event with its payment state (advance pending, advance verified, balance due, fully paid), held dates, and the free days still to fill. A "Dates to fill" list sorts upcoming free dates, with a one-tap "Promote this date" (§11).
2. **No-lost-enquiry tracker.** Every enquiry (website, WhatsApp click, call logged by staff) gets a reply timer. Default target: first reply within 15 minutes during opening hours, configurable. If nobody replies, the manager gets a reminder and then the owner is alerted. Enquiries that go quiet are flagged for follow-up.
3. **Morning WhatsApp summary.** Every morning at a set time (default 9 AM, venue time zone) the owner and managers get: today's events, new enquiries, unanswered enquiries, payments due or overdue, holds expiring today.
4. **Automatic Google review request.** The day after an event is marked Completed, the customer gets a WhatsApp message thanking them, with the venue's Google review link. It goes to every completed booking that opted in. Google's rules forbid sending the link only to happy customers ("review gating"), so the system never filters by satisfaction.
5. **Event-day run sheet.** One page per event, readable on a phone and printable: timings, hall, guest count, final menu, stage theme, add-ons, special notes, balance still to collect, and the staff on duty from the duty schedule.

## 11. Automatic marketing

Runs from the dashboard. Every campaign is opt-in only: a message goes only to people who gave WhatsApp consent, every message has an opt-out ("reply STOP"), opt-outs are honoured at once, and there is a frequency cap per person (default one marketing message a week). WhatsApp marketing messages use templates approved by Meta. Contacts imported from the old Google Sheet are not messaged unless they gave consent.

1. **Fill empty dates.** From "Dates to fill", the manager sets a discount on a free date. The date gets a "Special price" badge on the public calendar, and opted-in leads who asked about a similar date or event get a WhatsApp offer.
2. **Enquiry follow-ups.** An enquiry that did not book gets polite follow-ups (default day 1, 3 and 7). They stop as soon as the customer replies, books or opts out.
3. **Hold expiry nudge.** A reminder to the customer 12 hours before their 48-hour hold expires.
4. **Season campaigns.** Ready templates for wedding season, Eid and year-end corporate events, sent to an audience the manager picks (for example past corporate enquiries).
5. **Anniversary greeting.** One year after an event, a greeting with an offer for the family's next event.
6. **Referral link.** Each confirmed customer gets a personal link. When someone books through it, both get the discount the venue set. The system tracks it by referral code.
7. **Campaign results.** Sent, delivered, replied, bookings and revenue for each campaign, so the owner sees what works.

## 12. Owner and manager dashboard

Part of the MVP. Designed after the public site, using the mockup's look. Scope from the master prompt plus §10 and §11:
- Today and upcoming events, pending enquiries, advances due, balances, alerts.
- Sheet-like bookings table (replaces the Google Sheet) with CSV import of existing bookings using standard venue-booking columns: booking date, event date, slot, event type, hall, customer, phone, guests, package, quote total, advance, paid, balance, status, payment verified by, tax paid, notes.
- Calendar: block, hold, release, and date-specific pricing. Free, held, booked and blocked at a glance.
- Staff duty schedule (day, week, month), each person sees their own.
- Charts: bookings and revenue over time, collected vs outstanding, occupancy, popular events and packages, enquiry-to-booking conversion.
- Menus, packages, offers, media library (replace photos without code), staff and permissions, audit log.

## 13. Media

- Real venue media lives in `references/venue/` with sources in `manifest.csv`. In the product, media is stored in object storage with a manifest (category, alt text, source, licence, uploaded by).
- Enhancement pipeline used for the mockup: Real-ESRGAN x4 upscale, then `tools/enhance.py` grading into small, medium and large JPGs. In the product, upload makes these sizes automatically. AI upscaling stays an offline tool, not a product feature.
- Owner content needed: more distinct room photos (Valima and Corporate currently reuse other photos; two lounge photos look alike), original drone and gimbal footage, TikTok and Facebook URLs.

## 14. Visual system

- Platform default theme: warm stone and ivory, charcoal, champagne (from `CLAUDE_marquee_project.md`).
- Manor tenant theme (approved in the mockup): ink `#0b0405`, champagne `#d9bf8c`, ivory `#f4ece0`, muted `#b3a597`, maroon `#5b0f1a`. Display font Cormorant Garamond (italic champagne accent words), body Inter.
- Theme is tenant configuration (colours, fonts, logo), never hard-coded in components.
- Motion: one scroll-driven system with smoothed progress per pinned section. Film grain, gold dust, light leak and letterbox open are optional effects and switch off with reduced motion and on low-power devices.

## 15. Technical direction

As proposed in the master prompt, to be confirmed in the M0 architecture doc:
- Next.js (App Router) + TypeScript, Tailwind with custom tokens, shadcn/ui only where it fits.
- Supabase Postgres, Auth, Storage, row-level security, migrations in Git.
- One animation approach for the scroll scenes. GSAP ScrollTrigger only if the custom smoothing proves insufficient. Three.js only for a later 3D or panorama tour, loaded lazily.
- Tests: unit tests for pricing, availability and state transitions; tenant-isolation negative tests; Playwright for customer and staff journeys.
- Hosting: chosen before launch. Option A, managed cloud: Vercel for the app, Supabase for database, logins and files, plus a domain per venue. Option B, one VPS with a public IP: the same app and a self-hosted Postgres in Docker, with HTTPS via a reverse proxy. To keep both open, the app uses plain Postgres features (RLS, migrations as SQL files), keeps Supabase-specific calls behind small adapters, and runs scheduled jobs (reminders, morning summary, marketing) through one job runner that works on either host.
- Automatic WhatsApp messages (§10, §11) need the WhatsApp Business Cloud API, which needs Meta business verification and approved templates. Until it is connected, the dashboard shows these messages as ready to send with a click-to-WhatsApp button, never as sent.

### Built for change (user requirement, 2026-10-19)

After launch, a change must touch one section of the code, not the whole app.
- The code is split into feature modules (tenants, users and permissions, public site sections, booking, pricing, payments, notifications, marketing, invites, media, reports). Each module owns its screens, server logic, database migrations and tests in one folder, and other modules use it only through its public entry file.
- Each public-site section is its own component, fed by tenant configuration. Adding, removing or reordering a section is a settings change; restyling one section touches one folder.
- Outside services (payment gateway, bank API, WhatsApp, email, storage) sit behind adapters. Changing a provider means one new adapter file plus settings.
- Business values (prices, timings, limits, texts, feature switches) live in tenant settings, not in code.
- `docs/ARCHITECTURE.md` keeps a "where to change what" table that maps common changes to the exact module.

## 16. Non-functional

- Security: server-side validation, RLS, rate limits on public booking endpoints, signed booking links, no personal data in logs, audit log.
- Performance: a fast first view on mid-range phones in Pakistan on 4G. Lazy image sizes, effects off on low-power devices.
- Accessibility: keyboard, visible focus, labels, contrast on photos, reduced motion.
- SEO: per-venue metadata, local business schema, no indexing of dashboards or booking links.
- Works when WhatsApp, payments or WebGL are unavailable.

## 17. Out of scope for MVP

- Self sign-up and subscription billing for tenants.
- Connecting a live bank or gateway API (the interface and auto-booking rule ship in the MVP; the adapter is added when the merchant account is ready).
- Urdu content (structure is ready for it).
- 3D model or 360° tour (seam kept for later).
- Vendor marketplace, inventory and supplier management.

## 18. Open items for the owner

1. Real phone and WhatsApp number of the events manager. The site lists 0300 5554501 while Google shows +92 300 5554135.
2. Manager's real name (mockup uses "Ahmed").
3. Real packages, menus, per-guest prices, minimum guests, offers, tax rule and advance rule.
4. Opening hours (Google 11 AM to 9:30 PM, website 10 to 9).
5. Hall list with capacities, and lunch/dinner slot times.
6. Distinct room photos, original drone and gimbal footage, TikTok and Facebook URLs.
7. Columns of the current Google Sheet, if they can be shared later, to map the CSV import.
8. The venue's Google review link (from the Google Business Profile).
9. Photos of past stage setups with their theme names and prices, for the stage theme preview.
10. A WhatsApp Business number and Meta business verification for automatic messages.
11. Which bank or gateway will take online payments, and the venue's merchant account for it (needed before online auto-booking goes live).
12. Whether customers may book instantly at the standard package price, or the manager always finalises the quote first.
13. Discount rules the owner is happy with for empty dates, referrals and anniversaries.

## 19. Next steps after approval

1. Write the M0 planning documents in `docs/` (requirements, user journeys and permissions, sitemap, architecture, data model with RLS, visual brief, integrations checklist, roadmap with milestones, risks). The MVP is large, so the roadmap ships it in order: public site and booking flow, then dashboard and payments, then the unique features, then automatic marketing. Each milestone is usable on its own.
2. Turn the roadmap into an implementation plan (writing-plans).
3. Ask the user to choose subagent-driven or inline execution before any code.
4. `git init` with `.superpowers/`, `.tools/` and `.playwright-mcp/` in `.gitignore`.
