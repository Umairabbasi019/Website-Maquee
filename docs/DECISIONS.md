# Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-18 | PKR and Asia/Karachi defaults, configurable per tenant | Pakistan market |
| 2026-10-18 | WhatsApp first, email backup | How customers in Pakistan communicate |
| 2026-10-19 | English now, Urdu later via locale layer | Faster launch |
| 2026-10-19 | Photo-based cinematic site now, owner's drone video later | Footage not yet available |
| 2026-10-19 | Super admin creates tenants; no self sign-up | Platform owner sells and onboards each marquee |
| 2026-10-19 | Only the super admin manages everything; other users get role-scoped views | User requirement |
| 2026-10-19 | 1–2 manager logins per venue (default 2) with full venue control | User requirement |
| 2026-10-19 | Manual payments now; online payment auto-books when the provider confirms; bank API later | User requirement; merchant account not ready |
| 2026-10-19 | Multi-tenant with per-tenant config and feature switches | Sell to many marquees and future plans without code |
| 2026-10-19 | All unique customer/owner features and automatic marketing in MVP, shipped by milestone | User requirement |
| 2026-10-19 | Hosting decided before launch; build portable | User chose "decide later" |
| 2026-10-19 | Built for change: feature modules, adapters, config, "where to change what" table | User requirement |
| 2026-10-19 | Public mockup v6 approved section by section | Visual direction locked |
| 2026-10-19 | `references/` media kept out of git (571 MB) | Repo size; product media lives in object storage |
| 2026-10-20 | Staff sign in with email and password in M1; phone OTP later | Works with local Supabase and needs no SMS provider yet |
| 2026-10-20 | Local development runs on Docker (Supabase CLI) | Same database and RLS as production; safe to reset |
| 2026-10-20 | Login limit defaults: 5 logins per venue, 2 of them managers | Matches the 1-2 manager requirement; the super admin can change both per tenant |
| 2026-10-20 | Only the super admin changes owner memberships and grants above role defaults | User decision; stops a manager from raising their own access |
| 2026-10-20 | Tenant login limit, manager limit, currency and time zone are columns on `tenants`, not settings JSON | The database enforces them with a locked trigger, so they must be real columns |
| 2026-10-20 | Platform admin needs MFA (aal2) in the database, not only in the app | A bug in app code cannot give admin rights to a password-only session |
| 2026-10-21 | Session refresh runs in the proxy | Server components cannot write cookies, so expired sessions would otherwise log users out |
| 2026-10-21 | Halls and slots are written with `tenant.settings.edit` | Simple for M1; revisit in M2/M3 when booking rules are built |
| 2026-10-21 | Members of a paused tenant cannot read their tenant row; the server shows a paused notice | The database blocks everything for paused tenants; only the super admin sees them |
| 2026-10-21 | Custom roles are super admin only until M6 | A tenant owner could create roles with "never" keys or extra manager-like roles that skip the manager limit |
| 2026-10-24 | Site content (hero, captions, event text, contact) is a `content` block inside `tenant_settings`, checked by a Zod schema | A new venue needs only data, not code; one place to edit and validate |
| 2026-10-24 | Section styles are CSS Modules ported from the approved mockup, coloured by theme CSS variables | Keeps the approved look; no venue colour or font in code |
| 2026-10-24 | Venue photos go in a public `venue-media` bucket; only the service role writes | Public pages need plain image URLs and a CDN; writes stay closed to browsers |
| 2026-10-24 | Sites stay noindex while content or catalogue is marked sample | Sample copy and prices must not appear in search as the venue's real offer |
| 2026-10-24 | Depth parallax is a progressive layer: desktop, fine pointer, hardware WebGL2 only; the server `<img>` stays as fallback and LCP | Phones and weak devices keep a fast, stable hero; the effect never blocks first paint |
| 2026-10-24 | Responsive images use server-rendered `<img srcset sizes>` with pixel sizes stored in `media_assets.dims` | Replaced client-side size picking; the browser chooses once, with no layout shift or JavaScript needed |
| 2026-10-24 | `content-visibility: auto` only on unpinned sections | Skips off-screen layout work; pinned scroll scenes need real layout |
| 2026-10-24 | `Intl` formatting stays off hydration: prices formatted on the server, `useAfterIdle` for live hours and the date minimum | First-use `Intl` setup cost hundreds of ms on slow phones |
