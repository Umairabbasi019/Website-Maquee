# Top Risks

| # | Risk | Impact | Mitigation / decision needed |
|---|---|---|---|
| 1 | Data from one marquee leaks to another | Lost trust, legal trouble | RLS on every table, server `can()` checks, negative tests in every milestone. Decision: none, it is a rule. |
| 2 | Double booking of a date | Two families, one hall | Database exclusion constraint + transaction on reserve + concurrency test. |
| 3 | Booking confirmed without real money | Financial loss | Only staff verification or a signed, matched, non-repeated provider confirmation confirms. Redirect pages and receipts never do. |
| 4 | WhatsApp API approval delays or template rejections | No automatic messages at launch | Click-to-WhatsApp and "ready to send" fallback. Decision: venue starts Meta verification early (before M7). |
| 5 | Marketing seen as spam, number blocked by Meta | Venue loses its WhatsApp number | Opt-in only, STOP honoured, caps, approved marketing templates, no messaging of imported contacts without consent. |
| 6 | Bank/gateway merchant account takes long | No online auto-booking | Manual path is complete on day one; adapter added later without changing booking logic. Decision: which bank/gateway (open item). |
| 7 | MVP scope is large | Late launch | Milestones are usable on their own; Manor can go live after M6 with manual payments while M7–M9 continue. Decision: confirm launch point after M6. |
| 8 | Heavy cinematic site slow on 4G phones | Lost customers | Small image variants, effects off on low-power, Lighthouse checks in M2 and M10. |
| 9 | Hosting decision late | Re-work at launch | Portable build (plain SQL, adapters, one job runner). Decision: hosting choice before M10. |
| 10 | Sample prices taken as real | Wrong quotes | Sample content labelled in admin; launch checklist requires real prices. |
| 11 | Super admin account compromised | All tenants exposed | Strong password + MFA for super admin, audited access, short sessions. Decision: enable MFA in M1. |
| 12 | Personal data (phones, names) mishandled | Privacy complaints | No PII in logs, token links expire, invite pages deleted after 90 days, data export per tenant. |
