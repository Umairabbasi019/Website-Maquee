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
