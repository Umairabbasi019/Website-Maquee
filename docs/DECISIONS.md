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
