# Project Instructions — Marquee Management Platform

## Project goal
Build a premium, cinematic, multi-tenant marquee/event-venue booking and operations platform. Follow `docs/PROJECT_BRIEF.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` as the source of truth once those files are created.

## Working rules
- Work on one approved milestone at a time. Never build multiple milestones just because they are listed in the roadmap.
- Before coding, state a short plan and the likely files/areas to change.
- Prefer small, coherent diffs. Do not rewrite stable files or install dependencies without a clear reason.
- Verify claims: report only tests, checks, messages, payments, deployments, or integrations that were actually run and verified.
- If credentials are missing, implement a clean provider interface and honest development/test states. Never invent secrets or claim a service is connected.
- After each milestone, update `docs/ROADMAP.md` and `docs/DECISIONS.md`, summarize changed files and checks, list limitations, and stop.
- Use `/clear` between milestones; reload the project docs rather than relying on old chat history.

## Product invariants
- Tenant/venue isolation is a security requirement. Never trust a tenant ID from the browser for authorization. Enforce authorization server-side and through Supabase RLS.
- Prices are calculated server-side using one tested pricing service. Never trust client-submitted totals or use binary floating point for money.
- Save an agreed quote snapshot with the booking so future price/menu changes do not silently alter it.
- A screenshot of a payment is not proof of payment. Only verified gateway webhooks or authorized staff verification can mark an offline payment as received.
- Slot availability and double-booking prevention must be enforced server-side/database-side, not only in the UI.
- WhatsApp/email delivery must not be faked. Distinguish queued, accepted, delivered, and failed states where the provider exposes them.
- Never present placeholder stock media as the actual venue. Keep source/license/attribution data and make media replaceable from admin.
- The public site must remain usable if WebGL, external media APIs, payments, or WhatsApp are unavailable. Respect reduced-motion preferences.
- Do not expose private dashboards or customer booking records to search engines.

## Visual direction
Premium architectural editorial: warm stone/ivory, charcoal, muted champagne/brass accents, strong typography, full-bleed venue imagery, layered depth, restrained motion, and clear booking actions. Do not use a generic SaaS template. The 3D scene is progressive enhancement, not a dependency for core booking functionality.

## Definition of done for a milestone
1. Scope and acceptance criteria are met.
2. Relevant lint/type checks/tests/browser tests have actually been run and their results reported.
3. No known dead primary actions or fake integration-success states are introduced.
4. Security/access boundaries and responsive/reduced-motion behavior are considered.
5. Docs and roadmap reflect the actual implementation.
