# M4 Booking Requests and Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer sends a booking request for any future date. A manager confirms it with a hall and a locked price, or declines it. The customer sees the outcome on a private link.

**Architecture:** A new `booking` module owns the pricing service (pure TS), the request, token and staff server code, and the dashboard and public UI parts.
- Public writes go through a server action. The action resolves the tenant from the proxy headers and writes with the service client inside `src/modules/booking/server/`. There is no anon RLS.
- Staff reads use the caller's session under RLS.
- Status changes go through SQL functions that the service role alone can execute. The server action calls them after `requirePerm`, passing the actor.
- The database enforces three rules on its own: the transition table, quote immutability, and the `confirmed` exclusion constraint.

**Tech Stack:** Next.js 16.4.2 App Router and Server Actions, React 19.3, Supabase local Postgres (`btree_gist` already on), Zod 4.6.7, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-m4-booking-requests-design.md`. Read it before any task, and follow its "Settled" and "Owner answers" sections exactly.

## Global Constraints

- **Branch and commits:**
  - Work on branch `feat/m4-booking-requests`, never on `main`.
  - Every commit message ends with `Co-authored-by: Umair Abbasi <umairabbasi.019@gmail.com>`.
  - No Claude or Anthropic credit.
- **No new dependencies.** Ask before adding one.
- **Tenant ID** comes only from `x-tenant-id`, which `src/proxy.ts` sets, or from `getDashboard()`. It never comes from a form, URL or body.
- **Money is integer paisa.** Forms take rupees through `parseRupees` (`src/sections/shared/format.ts`) and display through `formatRs`.
- **Every new table:**
  - RLS is on, with no anon policies.
  - Staff `select` needs `bookings.view`.
  - Direct client `insert`, `update` and `delete` are refused.
  - Negative tests cover anon, another tenant, a staff user without `bookings.view`, and a deactivated user.
- **Nothing public reveals availability.** Same response, same message and same code path for free and taken dates. A test pins this.
- **Pages:**
  - `/b/[token]` and `/book/sent` are noindex and `follow: false`. Copy the pattern in `src/app/site-preview/page.tsx`.
  - The public form works without JS and respects reduced motion.
- **Imports and docs:**
  - Import other modules only through `index.ts`, or `client.ts` for client components.
  - Add `booking` to `modules` in `eslint.config.mjs`.
  - Update the "Where to change what" table in ARCHITECTURE.md in the task that adds module code.
- **Platform strings** go through `t()` in `src/ui/i18n/en.ts`.
- **Checks:**
  - Baseline: unit 232, db 186, e2e 59.
  - Run `npm run db:seed` before db and e2e tests.
  - Report only checks you actually ran.

## Decisions taken in this plan

- **Customer entry point:** a new public page `/book` with a plain form.
  - The Contact and Packages sections get a "Request booking" link to `/book`, with the current choices as query params (`date`, `event`, `slot`, `guests`, `package`). Those params only prefill the form and are validated again on submit.
  - The WhatsApp enquiry stays as it is.
- **Status changes** run through `confirm_booking`, `decline_booking` and `cancel_booking` SQL functions. They are `security definer`, executable by `service_role` only, and each takes `p_actor uuid`.
  - Why: the quote is computed in TS, so a staff client must not be able to post its own "calculated" total straight to the database.
  - The server action runs `requirePerm('bookings.edit')`. It also runs `requirePerm('quotes.override')` when the final total differs from the calculated one.
- **`during`** is computed in SQL inside `confirm_booking` from `event_date`, the slot times, `buffer_minutes` and `moneyRules.timeZone`. When end is at or before start, the slot ends the next day.
- **Rate limit:** a new table `booking_request_hits` (tenant_id, key_hash, at). A request is refused when the same phone hash or IP hash has ≥5 hits in the last hour.
  - The IP hash uses `BOOKING_HASH_SECRET`. Add it to `.env.example`. Missing in production means a startup error. In dev, fall back with a warning.
  - `shortcut: the table grows without bound, so prune rows older than a day in the M7 job runner.`
- **Deleting a slot** that bookings use: the FK is `on delete restrict`. The existing `deleteSlot` maps the error `23503` to a new `"inUse"` result, and the settings screen shows "This time is used by bookings".

## Review Focus

1. **Free and taken dates look the same.** A request for a date with a confirmed booking gets the same response shape, status and page as a free date (unit test in Task 3, e2e in Task 4).
2. **Two managers confirm the same hall, date and slot at once.** Exactly one succeeds. The other gets `slotTaken` and no partial quote row (db test in Task 5).
3. **A dinner slot from 19:00 to 01:00 next to a next-day lunch at 12:00, with a 60-minute buffer.** They do not overlap. A 19:00–01:00 slot and a 00:30–03:00 slot on the next date do overlap (db test in Task 5).
4. **Phone typed the way people type it.** `0300 1234567`, `+92 300 1234567` and `92-300-1234567` are accepted as `+923001234567`. `12345`, a landline and an empty value are refused (unit test in Task 3).
5. **Override without `quotes.override`.** A custom role with `bookings.edit` alone can confirm at the calculated price, but is refused on a changed total (unit test in Task 5, e2e in Task 6).

---

### Task 1: Pricing service

**Files:**
- Create: `src/modules/booking/pricing.ts`, `src/modules/booking/index.ts`, `src/modules/booking/client.ts`
- Modify: `eslint.config.mjs` (add `booking`)
- Test: `tests/unit/pricing.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type PriceInput = {
    guests: number;
    pkg: { name: string; pricePerGuestPaisa: number } | null;
    addons: { name: string; pricePaisa: number; basis: "flat" | "per_guest" }[];
    hall: { name: string; hirePricePaisa: number | null } | null;
    datePrice: { label: string; kind: "percent" | "per_guest"; value: number } | null;
    taxPercent: number; advancePercent: number;
  };
  type QuoteLine = { kind: "hall" | "package" | "addon" | "date" | "tax"; label: string; amountPaisa: number };
  type Quote = { lines: QuoteLine[]; subtotalPaisa: number; taxPaisa: number; totalPaisa: number; advancePaisa: number };
  function priceQuote(i: PriceInput): Quote;
  function applyOverride(q: Quote, finalTotalPaisa: number, taxPercent: number, advancePercent: number): Quote & { calculatedTotalPaisa: number };
  function roundHalfUpToRupee(paisa: number): number;
  function pickDatePrice<T extends { eventTypeId: string | null }>(matches: T[], eventTypeId: string): T | null; // event-specific beats all-events
  ```
- `index.ts` and `client.ts` both export the pricing functions. Pricing is pure and safe for the client.

- [ ] **Step 1: Write failing tests** in `tests/unit/pricing.test.ts`:
  - `roundHalfUpToRupee(150)` → 200, `(149)` → 100, `(-150)` → -200.
  - Package 320000 × 250 guests, no hall or add-ons, tax 0, advance 50: total 80000000, advance 40000000.
  - Add-on `per_guest` 5000 × 250 → line 1250000. Add-on `flat` 2000000 → line 2000000.
  - Date price `percent` -10 on subtotal 80000000 → line -8000000. `per_guest` 10000 × 250 → line 2500000.
  - Tax 16% on (subtotal + date line) rounds once to the rupee. The tax line equals `taxPaisa`.
  - Hall with `hirePricePaisa: null` adds a 0 line. Hall `null` adds no line.
  - `pkg: null` → no package line.
  - `applyOverride(q, 70000000, 16, 50)` → `totalPaisa` 70000000, `taxPaisa = roundHalfUpToRupee(70000000*16/116)`, `advancePaisa = roundHalfUpToRupee(35000000)`, and `calculatedTotalPaisa` equals the original total.
  - `pickDatePrice` prefers the row whose `eventTypeId` matches over the `null` row.
- [ ] **Step 2: Run** `npx vitest run tests/unit/pricing.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `pricing.ts`. Put a header comment stating the rounding rule: half up to the whole rupee, once per line.
- [ ] **Step 4: Run** the same test. Expected: PASS. Then run `npm run lint` and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(booking): pricing service`.

### Task 2: Booking schema, guards and RLS

**Files:**
- Create: `supabase/migrations/20261027000100_booking.sql`
- Modify: `src/modules/tenants/settings.ts` (add `showPriceEstimate: z.boolean().default(true)` to `MoneyRulesSchema`), `src/app/dashboard/settings/` money-rules form (checkbox), `src/ui/i18n/en.ts`
- Test: `tests/db/booking.rls.test.ts`, `tests/db/booking-guards.test.ts`, `tests/unit/tenant-settings.test.ts`

**Interfaces:**
- **Tables:**
  - `customers`, per DATA_MODEL. Unique `(tenant_id, phone_e164)`.
  - `bookings`:
    - `id`, `tenant_id`, `reference` text, unique `(tenant_id, reference)`.
    - `customer_id`, `event_date` date, `slot_id` FK restrict, `event_type_id`, `package_id` null, `addon_ids` uuid[] default `{}`, `guests` int > 0.
    - `hall_id` null, `during` tstzrange null.
    - `status` text check in (`requested`, `confirmed`, `declined`, `cancelled`), default `requested`.
    - `status_reason` text null, `current_quote_id` null, `created_at`.
    - Check: `status = 'confirmed'` implies `hall_id`, `during` and `current_quote_id` are not null.
    - Exclusion `no_overlap`: `exclude using gist (hall_id with =, during with &&) where (status = 'confirmed')`.
  - `booking_status_history` (`booking_id`, `from_status`, `to_status`, `actor` uuid null, `reason`, `at`). Written by a trigger on a `bookings.status` change.
  - `quotes` (`id`, `tenant_id`, `booking_id`, `version` int, `snapshot` jsonb, `total_paisa`, `advance_paisa`, `created_by`, `created_at`):
    - unique `(booking_id, version)`
    - a trigger refuses `update` and `delete` (`quote_immutable`)
  - `access_tokens`, per DATA_MODEL.
  - `booking_ref_counters` (`tenant_id`, `yymm` text, `n` int, pk (`tenant_id`, `yymm`)).
  - `booking_request_hits`, per the plan decisions.
- **Transition guard trigger:** allowed transitions are `requested→confirmed|declined|cancelled` and `confirmed→cancelled`. Anything else raises `P0001 invalid_transition`. A `confirmed` row may not change `event_date`, `slot_id`, `hall_id`, `guests`, `package_id`, `addon_ids` or `current_quote_id` (`booking_locked`).
- **RLS:** `select` with `auth_has_perm(tenant_id,'bookings.view')` on `customers`, `bookings`, `booking_status_history` and `quotes`. No client policies on `access_tokens`, `booking_ref_counters` or `booking_request_hits`.
- Add the money-rules column check in the existing settings trigger if field-level, following `check_settings_write`.

- [ ] **Step 1: Write failing db tests:**
  - RLS negatives per table: anon, tenant B, no-perm staff, deactivated user, and a direct insert by a manager. All get nothing or are refused.
  - The guard refuses `declined→confirmed`.
  - The guard refuses an `event_date` update on a confirmed row.
  - A `quotes` update raises `quote_immutable`.
  - `MoneyRulesSchema.parse({})` gives `showPriceEstimate: true` (unit).
- [ ] **Step 2: Run** `npm run db:reset && npx vitest run tests/db/booking*.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration.** Add the checkbox to the money-rules form, saved with the existing `saveMoneyRules`.
- [ ] **Step 4: Run** the db tests, then the full db and unit suites. Expected: PASS, with no change to earlier counts except additions.
- [ ] **Step 5: Commit** `feat(booking): tables, transition guard, quote lock, RLS`.

### Task 3: Request and token server code

**Files:**
- Create: `src/modules/booking/request.ts` (Zod and phone normalising), `src/modules/booking/server/request.ts`, `src/modules/booking/server/token.ts`, `supabase/migrations/20261027000200_booking_request_fn.sql`
- Test: `tests/unit/booking-request.test.ts`, `tests/db/booking-request.test.ts`

**Interfaces:**
- Consumes: `priceQuote` and `pickDatePrice` from Task 1, `getPublicCatalogue` (catalogue), `listSlots`, `getMoneyRules` and `listHalls` (tenants), `listDatePrices` (calendar), `createServiceClient` (access).
- Produces:
  ```ts
  const BookingRequestSchema: z.ZodType<BookingRequestInput>; // date, slotId, eventTypeId, guests, packageId?, addonIds[], name, phone, whatsappConsent, website (honeypot, must be empty)
  function normalisePkMobile(raw: string): string | null; // E.164 +923XXXXXXXXX or null
  function createBookingRequest(tenantId: string, input: unknown, ipHash: string): Promise<{ ok: true; reference: string; token: string } | { error: "invalid" | "limited" }>;
  function estimateFor(tenantId: string, input: unknown): Promise<Quote | null>; // null when showPriceEstimate is off or no package
  function getBookingByToken(token: string): Promise<CustomerBookingView | null>; // null for unknown, expired or revoked tokens
  type CustomerBookingView = { reference: string; status: "requested"|"confirmed"|"declined"|"cancelled"|"expired"; eventDate: string; slot: string; eventType: string; guests: number; packageName: string | null; addons: string[]; hall: string | null; quote: Quote | null; venueName: string };
  ```
- SQL function `create_booking_request(p_tenant uuid, p_customer jsonb, p_booking jsonb, p_token_hash text, p_expires timestamptz, p_key_hashes text[]) returns text` (the reference). It is service-role only and does everything in one transaction:
  1. Checks the hit limit, raising `P0001 rate_limited`.
  2. Inserts the hits.
  3. Upserts the customer.
  4. Allocates the reference from `booking_ref_counters` with `insert … on conflict do update set n = n + 1 returning n`.
  5. Inserts the booking and the token.
- Token: 32 random bytes, base64url. Store `sha256` hex. Expiry is `event_date + 60 days`.
- The view status is `expired` when `status = 'requested'` and `event_date < today` in the venue time zone.
- The quote is shown only when the status is `confirmed`.

- [ ] **Step 1: Write failing tests:**
  - Unit: the phone cases from Review Focus 4.
  - Unit: the honeypot refuses.
  - Unit: a date before today or more than 18 months out is refused.
  - Unit: guests above the largest active hall capacity are refused.
  - Unit: a `slotId`, `eventTypeId`, package or add-on from another tenant, or an inactive one, is refused.
  - Unit: `createBookingRequest` gives an identical result shape for a date with a confirmed booking.
  - DB: the reference format `^[A-Z]{2}-\d{4}-\d{4}$`, increasing per month.
  - DB: the sixth request in an hour from the same phone gives `limited`.
  - DB: a token resolves only its own booking. A wrong, expired or revoked token gives `null`.
  - DB: the customer view never contains `phone`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Re-check the tenant's own rows on the server. Never trust ids from the form without a tenant-scoped lookup.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run lint and typecheck.
- [ ] **Step 5: Commit** `feat(booking): public request, reference and token`.

### Task 4: Public pages

**Files:**
- Create: `src/app/book/page.tsx`, `src/app/book/actions.ts`, `src/app/book/sent/page.tsx`, `src/app/b/[token]/page.tsx`, `src/modules/booking/ui/RequestForm.tsx`, `src/modules/booking/ui/BookingView.tsx`
- Modify: `src/sections/contact/Contact.tsx` and `src/sections/packages/PackageTabs.tsx` ("Request booking" link), `src/ui/i18n/en.ts`, `docs/SITEMAP.md`
- Test: `tests/e2e/booking-request.spec.ts`

**Interfaces:**
- Consumes: Task 3 functions. The tenant comes from headers, as in `src/app/page.tsx`'s `request()`.
- `RequestForm` is a server component form posting to `submitBookingRequest`. A progressive client island shows the live estimate only when `showPriceEstimate` is on. The island calls `estimateFor` through a server action, and the server action takes no totals.
- On success the action redirects to `/book/sent?ref=<reference>&t=<token>`. That page shows the reference and the link `/b/<token>`. *Shortcut: the token sits in the URL of a noindex page. That is acceptable because the link itself is the credential.*
- `/b/[token]` shows `CustomerBookingView`:
  - confirmed: the final price lines, total and advance
  - declined or cancelled: `t("booking.notConfirmed")` = "This request was not confirmed. Please contact the venue."
  - expired: "This request has passed its date."
  - unknown token: `notFound()`

- [ ] **Step 1: Write failing e2e:**
  - Submit for a free date → sent page with the reference → open the link → status "requested".
  - The same flow for a date that has a confirmed booking gives the same page. Insert that booking in the test setup with the service client, because seed rows arrive only in Task 7.
  - With JS disabled (`javaScriptEnabled: false`) the submit still works.
  - The estimate is visible with the setting on and absent with it off.
  - `/b/garbage` → 404.
  - Both pages have `noindex`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/booking-request.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match the existing site styles.
- [ ] **Step 4: Run** the spec and the full e2e suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(booking): public request form and customer link`.

### Task 5: Staff server code and confirm

**Files:**
- Create: `src/modules/booking/server/staff.ts`, `supabase/migrations/20261027000300_booking_staff_fns.sql`
- Modify: `src/modules/tenants/server/venue-setup.ts` (`deleteSlot` maps `23503` → `"inUse"`), the settings slots form message
- Test: `tests/db/booking-confirm.test.ts`, `tests/unit/booking-staff.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type StaffBookingRow = { id: string; reference: string; status: string; eventDate: string; slot: string; hall: string | null; customerName: string; customerPhone: string; guests: number; eventType: string; totalPaisa: number | null };
  function listBookings(tenantId: string, q: { month?: string /* YYYY-MM */; status?: string }): Promise<StaffBookingRow[]>; // session client, RLS
  function getBookingDetail(tenantId: string, id: string): Promise<(StaffBookingRow & { packageName: string | null; addons: string[]; history: { from: string | null; to: string; at: string; reason: string | null }[]; quote: Quote | null }) | null>;
  function previewQuote(tenantId: string, id: string, hallId: string): Promise<Quote | null>;
  function confirmBooking(tenantId: string, id: string, input: { hallId: string; finalTotalRupees?: string; reason?: string }): Promise<{ ok: true } | { error: "invalid" | "forbidden" | "notFound" | "slotTaken" | "capacity" | "state" }>;
  function declineBooking(tenantId: string, id: string, reason: string): Promise<{ ok: true } | { error: "invalid" | "forbidden" | "notFound" | "state" }>;
  function cancelBooking(tenantId: string, id: string, reason: string): Promise<same as decline>;
  function countNewRequests(tenantId: string): Promise<number>;
  ```
- `confirmBooking`:
  1. `requirePerm('bookings.edit')`.
  2. Loads the booking and hall in the tenant. Checks the hall is active and `capacity_min ≤ guests ≤ capacity_max`, else `capacity`.
  3. Prices with `priceQuote`, then `applyOverride` if a different total is given. That needs `requirePerm('quotes.override')` and a reason of 3 to 300 characters.
  4. Calls `confirm_booking(p_booking, p_hall, p_snapshot jsonb, p_total, p_advance, p_actor)`, which inserts quote v1, sets `hall_id`, `during`, `current_quote_id` and `status`, in one transaction.
  5. Maps error `23P01` → `slotTaken` and `invalid_transition` → `state`.
- Each staff function writes `recordAudit`.

- [ ] **Step 1: Write failing tests:**
  - DB: two parallel `confirm_booking` calls on two requests for the same hall, date and slot. Exactly one is confirmed, the other raises `23P01`, and the loser leaves no quote row.
  - DB: the Review Focus 3 overlap cases.
  - DB: `authenticated` cannot execute the functions.
  - DB: deleting a slot that a booking uses raises `23503`.
  - Unit (mocked client): an override without `quotes.override` → `forbidden`.
  - Unit: the same total without `quotes.override` → ok.
  - Unit: guests over the hall capacity → `capacity`.
  - Unit: decline needs a reason.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the db and unit suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(booking): staff confirm, decline, cancel`.

### Task 6: Dashboard bookings and calendar screens

**Files:**
- Create: `src/app/dashboard/bookings/page.tsx`, `src/app/dashboard/bookings/[id]/page.tsx`, `src/app/dashboard/bookings/actions.ts`, `src/app/dashboard/calendar/page.tsx`, `src/modules/booking/ui/MonthCalendar.tsx`, `src/modules/booking/ui/ConfirmForm.tsx`
- Modify: `src/app/dashboard/page.tsx` (new-request count linking to `/dashboard/bookings?status=requested`), `src/ui/i18n/en.ts`
- Test: `tests/e2e/booking-staff.spec.ts`

**Interfaces:**
- Consumes: Task 5 functions and `getDashboard()`. Each page checks `canAny` again, the same way `[section]/page.tsx` does.
- The calendar is a month grid (`?month=YYYY-MM`) with one cell per date. Each cell lists entries as slot, status and customer name, each linking to the detail page. It works without JS and as a list at 375 px.
- The detail page shows the customer, the choices, the history and the quote.
  - When the status is `requested`, it shows `ConfirmForm`: a hall select, a quote preview that updates on hall change through `previewQuote`, an optional "Final total (Rs)" and reason, and Confirm.
  - It also has Decline and Cancel with a required reason.
  - The override field is hidden without `quotes.override`.
- Error copy:
  - `slotTaken`: "This hall and time were just confirmed for another booking."
  - `capacity`: "Guest count does not fit this hall."

- [ ] **Step 1: Write failing e2e:**
  - A manager opens the new request from Task 4's seed flow, confirms with hall and override "Rs 700,000" and a reason, and the customer link then shows Rs 700,000.
  - A second request for the same hall, date and slot shows the `slotTaken` message.
  - Decline → the customer link shows the not-confirmed copy.
  - A custom role without `quotes.override` sees no override field.
  - The calendar month shows the confirmed entry.
  - The overview shows the request count.
- [ ] **Step 2: Run** the spec. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full e2e, unit and db suites, then lint, typecheck and `npm run build`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(booking): dashboard bookings and calendar`.

### Task 7: Docs and seed

**Files:**
- Modify:
  - `docs/DECISIONS.md` (request mode, no public availability, service-role status functions)
  - `docs/REQUIREMENTS.md` (BKG-1, 3, 4 wording per the spec, BKG-8 moved to M8)
  - `docs/DATA_MODEL.md` (booking tables as built, `no_overlap` `confirmed` only)
  - `docs/ROADMAP.md` (M4 acceptance per the spec, M5 quick-booking switch, job runner to M7)
  - `docs/ARCHITECTURE.md` ("Where to change what": booking)
  - `docs/JOURNEYS.md` (customer request and manager confirm journeys)
  - `scripts/seed-data/` (two sample requests and one confirmed booking for Manor)
- Test: `npm run db:seed`, then the full suites.

- [ ] **Step 1: Update the docs and seed.**
- [ ] **Step 2: Run** `npm run db:seed`, then unit, db and e2e. Expected: PASS.
- [ ] **Step 3: Commit** `docs: M4 booking requests`.
