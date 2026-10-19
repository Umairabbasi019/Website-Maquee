# Marquee Booking Platform

Read first: docs/PROJECT_BRIEF.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md.
Longer original brief: CLAUDE_marquee_project.md and marquee_claude_master_prompt.md.

## Rules
- One approved milestone at a time. State plan and files before coding. Stop at the end for approval.
- Work on a branch `<type>/<short-kebab>`; never commit to main. Code review before merge.
- Change one module at a time. Import other modules only through their index.ts.
- Update the "Where to change what" table in ARCHITECTURE.md when modules change.
- Report only checks you actually ran.

## Invariants
- Tenant isolation: never trust a tenant ID from the browser; server can() + RLS on every table; negative tests.
- Money: server-side pricing service, integer paisa, immutable quote snapshots.
- A receipt or a redirect never confirms a booking. Only staff verification or a verified provider webhook.
- Double booking blocked in the database.
- No fake sent/paid/connected states.
- Public site works without WebGL, WhatsApp or payments; respects reduced motion.
- Private pages and token links are noindex.
