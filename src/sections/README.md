# Sections

Reusable page sections that tenants compose into their public site. Sections take content and theme tokens as props and import no tenant-specific code.

## Rules
- Props in, markup out: a section takes `{ site: SiteView }` (see `types.ts`) and reads everything from it.
- No runtime imports from `src/modules`; `import type` from a module index is fine. Client-safe helpers live in `shared/`.
- Colours and fonts come from the CSS variables `--color-*` and `--font-*` that the site module sets.
- Each section root has `id` equal to its section key. Registry: `src/modules/site/sections.ts`.
- Hidden-until-revealed styles are scoped under `.js`; reduced motion shows everything.
