# Project Brief

Source of truth for the product. Full design detail: `docs/superpowers/specs/2026-10-19-manor-marquee-design.md` (approved 2026-10-19).

## Product

A multi-tenant booking and operations platform for wedding marquees and event venues in Pakistan. Every venue (tenant) gets:
- a cinematic public website with a live date and price calendar and an online booking flow;
- a dashboard for the owner and staff that replaces the Google Sheet: bookings, calendar, payments, enquiries, run sheets, staff duty, charts;
- automatic WhatsApp reminders, summaries, review requests and opt-in marketing.

The platform owner (super admin) runs all tenants from one console and sells the product to other marquees. Adding a marquee is configuration, never code.

## First tenant

The Manor Marquee, Marquee Complex, Islamabad Expressway. The owner approved use of all venue photos and videos. Google rating 4.5 from 829 reviews: guests praise the venue, food and decor and complain about management and service. The platform targets that gap.

## Who uses it

| User | Main need |
|---|---|
| Super admin (platform owner) | Create and run every tenant, change anything, control features and logins. |
| Venue owner | See bookings, money and performance at a glance. |
| Manager | Answer every enquiry fast, quote, book, run events. |
| Accounts | Verify payments, track balances. |
| Staff | Know their duty and what each event needs. |
| Customer | See free dates and real prices, reserve without calling, pay, share with family. |

## Defaults

PKR, Asia/Karachi, English (Urdu later), WhatsApp first and email as backup. All configurable per tenant.

## Principles

1. Tenant isolation is a security requirement.
2. Money is calculated on the server, stored as integer paisa, and never confirmed by a receipt alone.
3. No fake states: nothing shows as sent, paid or connected unless it really is.
4. Built for change: one change touches one module (see `ARCHITECTURE.md`, "Where to change what").
5. The public site works without WebGL, WhatsApp or payment providers, and respects reduced motion.

## Documents

| File | Contents |
|---|---|
| `REQUIREMENTS.md` | MVP, later and out-of-scope requirements |
| `JOURNEYS.md` | User journeys and the permission matrix |
| `SITEMAP.md` | Public, customer, dashboard and super admin routes |
| `ARCHITECTURE.md` | Components, modules, adapters, hosting, where to change what |
| `DATA_MODEL.md` | Tables, tenant boundaries, RLS, constraints, indexes |
| `VISUAL_BRIEF.md` | Palette, type, motion, 3D approach, mobile fallback |
| `INTEGRATIONS.md` | Accounts and credentials needed later |
| `ROADMAP.md` | Milestones, sizes, acceptance criteria, tests |
| `RISKS.md` | Top risks and the decision that mitigates each |
| `DECISIONS.md` | Decision log |
| `QA_CHECKLIST.md` | Checks per milestone and before launch |
| `CLAUDE_PROPOSAL.md` | Proposed root `CLAUDE.md` and tooling |
