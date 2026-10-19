# QA Checklist

## Every milestone
- [ ] Acceptance criteria in `ROADMAP.md` met.
- [ ] Lint, type check, unit tests, Playwright run; results reported as run.
- [ ] RLS negative tests for any new table.
- [ ] No dead buttons, no fake success states.
- [ ] Laptop 1366/1440 and phone 375 checked; reduced motion checked.
- [ ] Keyboard and focus work on new screens; labels and contrast pass.
- [ ] "Where to change what" table updated if modules changed.
- [ ] Code review before merge to `main`.
- [ ] `ROADMAP.md` and `DECISIONS.md` updated.

## Before launch
- [ ] Real venue name, logo, contacts, address, hours, halls, capacities, packages, menus, prices, offers, policies configured; no "sample" labels left.
- [ ] Manager's real WhatsApp number replaces the test number 0308 502 1418.
- [ ] All photos approved; provenance kept.
- [ ] Hosting chosen and deployed; domains, HTTPS, redirects verified.
- [ ] Payment path tested end to end (manual; online if connected, with a real test payment).
- [ ] WhatsApp number, templates, webhooks, opt-in text verified with a real message.
- [ ] Email sender verified with a real message.
- [ ] Tenant isolation, roles, booking conflicts, payment transitions pass.
- [ ] Super admin MFA on.
- [ ] Privacy, terms, refund policies reviewed.
- [ ] Backups and restore tested; error alerts working.
- [ ] Lighthouse mobile performance and accessibility recorded.
- [ ] Dashboards and token pages not indexed.
