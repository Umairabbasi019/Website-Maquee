# M5 Payments: design

Date: 2026-10-28. Status: draft for owner review.

## Why

Manor takes advances by bank transfer, JazzCash and Easypaisa today and tracks them by hand. M5 puts that money on the booking: what is due, what came in, who checked it. It also builds online payment now behind a switch, so a real paid gateway can be plugged in later without rework.

## Goals

- A ledger per booking: total, every payment, every refund, balance left.
- Manual payments: the customer sees the venue's account details on their booking link, pays, uploads a receipt; a manager or owner verifies it.
- Staff record cash or direct payments themselves.
- Two booking modes per venue, switched by the manager or owner:
  1. **Manager first** (default): request, manager confirms, customer pays.
  2. **Quick booking**: customer pays the advance at once and the date is held for `holdHours`; a verified payment confirms it.
- Online payment through a provider interface with a sandbox adapter. Off by default. A real gateway adapter comes later on request.
- Dashboard alerts for anything a manager must act on.

## Non-goals

- A real gateway adapter or keys (later, on request; provider chosen after fee research).
- Sending money: refunds are done outside the system and recorded by hand.
- WhatsApp, SMS or email alerts (M7). Alerts are dashboard only.
- A job runner (M7). Expired holds are handled on the next write that touches the slot (see "Holds").
- Payment reports, CSV, charts (M6).

## Anti-goals (a failure even if it works)

- A receipt upload, a redirect or a return page marks anything paid or confirms a booking.
- The system cancels a booking or releases a confirmed date by itself.
- A customer is shown "paid" before a manager, owner or verified provider event says so.
- One venue sees or touches another venue's payments or receipts.
- Receipt images reachable by a public URL.

## Owner decisions (as stated)

1. Both modes exist; the manager switches between them.
2. Manager first: the date is blocked the moment the manager confirms, before any advance.
3. An unpaid advance past its deadline only alerts the manager. Nothing is cancelled. Many "reference" customers pay after the event, so late and post-event payment is normal.
4. Managers, owners and the accounts role record and verify payments (holders of `payments.verify`, as seeded in M1). Only managers and owners switch modes.
5. A receipt upload alerts the manager and owner on the dashboard.
6. Refunds are manual for now.
7. A rejected receipt never cancels the booking. The manager gives a reason, the customer sees it and can upload a new image. Cancelling is always the manager's own action. When a receipt is rejected after the event date, the owner is also alerted.
8. Online payment is built now with a sandbox, real gateway later.
9. Cancelling a booking that has money paid: the manager chooses each time between "Keep the money" (non-refundable advance) and "Refund due". Refund due shows as an alert until refunds cover the paid amount.

## How it works

### Modes

`moneyRules.instantBooking` (exists since M3) is the switch. Off = Manager first, on = Quick booking.

**Manager first.** M4 flow unchanged up to confirm. On confirm the booking is `confirmed` and blocks the slot (as now) and gets `advance_due_on = confirm date + advanceDueDays`. The customer link shows the payment panel. Payment never changes the booking status in this mode.

**Quick booking.** The `/book` form takes the same inputs. A package is required (quick booking is at the standard package price, no override). The server prices it with the M4 pricing service, picks the first free hall in hall sort order for that slot, and in one transaction creates the booking as `awaiting_advance` with hall, range, quote v1 and `hold_expires_at = now + holdHours`. The customer lands on `/b/<token>` with the payment panel. If no hall is free, the server creates a normal `requested` booking instead and the link says the manager will reply. (Builder's call: auto-pick hall; Manor has one hall.) Quick booking takes the same inputs as a request, add-ons included; the advance is `advancePercent` of the total, as in M4. When `advancePercent` is 0 the switch has no effect and `/book` stays in request mode (my call: quick booking means paying something first).

The mode is read when `/book` is submitted. Each booking keeps its own status, so switching modes never changes bookings already made.

A verified payment that brings the paid amount to at least the advance confirms an `awaiting_advance` booking. A smaller verified payment is kept and the hold stays.

### Statuses

New statuses: `awaiting_advance`, `hold_expired`, `refund_pending`, `refunded`.

| From | To | When |
|---|---|---|
| (new) | `awaiting_advance` | quick booking created |
| `awaiting_advance` | `confirmed` | verified paid ≥ advance |
| `awaiting_advance` | `hold_expired` | hold time passed and another write needs the slot |
| `awaiting_advance` | `cancelled` | manager cancels (reason) |
| `hold_expired` | `confirmed` | verified paid ≥ advance and the slot is still free |
| `hold_expired` | `refund_pending` | verified payment arrives and the slot is taken (PAY-4) |
| `refund_pending` | `refunded` | manager records refunds covering all verified money |

M4 moves stay. `no_overlap` counts `confirmed` and `awaiting_advance`. An `awaiting_advance` row must have hall, range, quote and `hold_expires_at`. Reads show an `awaiting_advance` row past `hold_expires_at` as "Hold expired" without writing.

### Holds (no job runner)

`create_quick_booking()` and `confirm_booking()` take the per-hall advisory lock (as now), then set every overlapping `awaiting_advance` row in that hall whose `hold_expires_at < now()` to `hold_expired`, then insert or confirm. So an expired hold only frees the slot when someone else needs it. The M7 job runner will expire holds on time later.

A verified payment on an `awaiting_advance` row confirms it even if the hold time has passed: nobody could take the slot without first flipping it to `hold_expired`. A verified payment on a `hold_expired` row re-takes the range under the hall lock: free → `confirmed`, taken (`23P01`) → `refund_pending` and a dashboard alert. The payment stays verified either way. When two `hold_expired` bookings try to re-take the same range, the first verified payment wins and the other goes to `refund_pending`.

There is no public availability (DATA_MODEL: availability is never public), so nothing outside the hall lock reads holds to decide free dates. The staff calendar shows an `awaiting_advance` row past its hold as "Hold expired".

### Ledger

`payments` (replaces the earlier DATA_MODEL sketch):

- `id, tenant_id, booking_id, kind ('payment'|'refund'), method ('bank'|'jazzcash'|'easypaisa'|'cash'|'online'), amount_paisa int > 0, status ('pending'|'verified'|'rejected'), source ('customer_receipt'|'staff'|'provider'), note, reject_reason, receipt_path, provider, provider_ref, recorded_by, verified_by, verified_at, created_at`
- unique (provider, provider_ref) where provider is not null.
- Refunds and staff records are written `verified` at once. Customer receipts start `pending`. Online payments start `pending` and only a verified provider event or a provider status check makes them `verified`.

Derived on read, never stored: paid = Σ verified payments − Σ refunds; balance = total − paid; advance met = paid ≥ advance. Payment state label: "Advance due", "Advance overdue", "Advance paid", "Balance due", "Fully paid", "Pays later".

Amount rules: a receipt or staff payment is 1 paisa..balance. A manager verifying a receipt may change the amount to what actually arrived (audited with old and new); the changed amount is what the confirm check uses, in the same transaction. A refund is 1 paisa..paid.

New booking columns: `advance_due_on date` (set at confirm in Manager first), `pay_later boolean default false` (manager marks a trusted customer; no overdue alert), `refund_due boolean default false` (set by the cancel choice; only on `cancelled` rows).

Cancel (`cancel_booking()`, M4) gains a required choice when paid > 0: keep the money or refund due. With paid = 0 nothing changes from M4. The booking stays `cancelled` either way; `refund_pending` stays for the PAY-4 late-payment case only.

New money rule: `advanceDueDays` int ≥ 0, default 3 (builder's call on the default).

New settings: `paymentAccounts` with optional `bank {bankName, accountTitle, accountNumber}` (accountNumber may be an IBAN), `jazzcash {accountTitle, number}`, `easypaisa {accountTitle, number}`. Not secret (INTEGRATIONS.md). Shown to the customer only for methods in `paymentMethods` that have details.

### Customer link `/b/<token>`

For `confirmed`, `awaiting_advance`, `hold_expired` and `refund_pending`, a payment panel shows: total, paid (verified only), balance, advance due and the due date or hold end, each payment with its state ("Checking", "Received", "Not accepted: <reason>"), the account details, and:

- **Upload receipt** form: method, amount in rupees, one image. Works without JavaScript (multipart Server Action). Allowed when the booking is not `cancelled`, `declined`, `refunded`.
- **Pay online** button, only when the venue has online payment on. It pays the remaining advance, or the balance once the advance is met.

Receipt rules: JPEG, PNG or WebP, at most 4 MB (under the 4.5 MB serverless request body limit; my call), type checked by content not name. At most 3 pending receipts per booking, at most 10 uploads per booking per hour, counted from `payments` rows of that booking (rejected included). Making many bookings to upload more is already capped by the M4 request rate limit. Stored in a new private bucket `payment-receipts` at `<tenant_id>/<booking_id>/<payment_id>.<ext>`, service role only: the file passes through the Server Action, no browser upload URL, and `storage.objects` has no policy for this bucket. Staff open it through a signed URL that lasts 5 minutes.

The page stays noindex, no referrer, own-host only (M4 rules).

### Staff

Booking detail (`/dashboard/bookings/[id]`) gets a ledger section for holders of `payments.view`. Holders of `payments.verify` also get: Verify (amount editable), Reject (reason required), Record payment (method, amount, note), Record refund (method, amount, note), Change advance due date, Pays later on/off, and for a pending online payment, Check status (calls the provider's `getStatus`). Every action is a service-role SQL function with `can()` checked in the server first, the booking row locked `for update`, and an audit event after commit.

Switching modes: `instantBooking` becomes editable by holders of both `bookings.edit` and `payments.verify` (owner and manager; not accounts, which lacks `bookings.edit`), like `showPriceEstimate` with `prices.edit` (DECISIONS 2026-10-28). Online payment on/off is the `gateway` entry in `paymentMethods`, same two keys. It can only be turned on when the venue has a provider and its secret saved. Account details, `advanceDueDays` and every other money rule stay with `tenant.settings.edit`.

### Alerts

Live queries on the overview page, no table, nothing to dismiss; an alert disappears when its cause is fixed. Shown to holders of `payments.verify`:

- Receipts waiting for review (per booking, count).
- Advance overdue: `confirmed`, `advance_due_on` passed, advance not met, not `pay_later`.
- Refund pending: `refund_pending` bookings, and `cancelled` bookings with `refund_due` whose paid amount is still above 0.
- Online payment pending more than 1 hour (builder's call on the hour).
- Owner only: receipts rejected for bookings whose event date has passed, last 30 days.

### Online payment

```ts
interface PaymentProvider {
  id: string; // "sandbox"
  createPayment(i: { paymentId: string; amountPaisa: number; currency: string; returnUrl: string }): Promise<{ redirectUrl: string; providerRef: string }>;
  verifyWebhook(rawBody: string, headers: Headers, secret: string): ProviderEvent | null;
  getStatus(providerRef: string, secret: string): Promise<"pending" | "paid" | "failed">;
}
type ProviderEvent = { eventId: string; providerRef: string; status: "paid" | "failed"; amountPaisa: number; currency: string };
```

`refund` is left out until a gateway does refunds (refunds are manual in M5). REQUIREMENTS PAY-2 is updated to say so.

Flow: Pay online → server inserts a `pending` online payment, calls `createPayment`, stores `provider_ref`, redirects. Return page `/b/<token>` shows "Checking payment" from the ledger only; it never changes anything.

Webhook `POST /api/payments/webhook/[provider]`: read raw body → find the payment by (provider, providerRef) → load that venue's `payments` secret (existing `tenant_secrets`, kind `payments`, encrypted by `encryptSecret` in `src/modules/tenants`, set by the super admin in M1's secret form) → `verifyWebhook` (bad → 400, nothing written) → check amount and currency equal the payment row, booking matches → insert into `provider_events` (event_id unique; repeat → 200, nothing else) → mark verified or rejected and apply the status rules above, all in one transaction. Same function serves Check status.

Sandbox adapter: HMAC-SHA256 of the raw body with the venue's secret, header `x-sandbox-signature`. A sandbox checkout page `/pay/sandbox/[ref]` with Pay and Fail buttons posts a signed event to the webhook. The sandbox exists only when `PAYMENTS_SANDBOX=1`; production builds refuse it, so the `gateway` method cannot be on in production until a real adapter exists.

## Constraints (project invariants that bind M5)

- Tenant from the host or the payment row, never from the browser. `can()` on the server plus RLS on `payments`; negative tests for another venue and for roles without the key.
- Money in integer paisa; amounts entered in rupees and converted on the server.
- Only staff verification or a verified provider event moves money to verified or confirms a booking.
- Double booking blocked in the database (`no_overlap` with the new status list).
- Public site works without JS; the receipt form too.
- Modules import each other only through `index.ts`. Payments is a new module `src/modules/payments`.
- Update the ARCHITECTURE "Where to change what" table, DATA_MODEL, JOURNEYS, SITEMAP, REQUIREMENTS, DECISIONS, ROADMAP.

## Tests the work must have

- DB: every new transition allowed and every other refused; `no_overlap` with `awaiting_advance`; lazy hold expiry; late payment on a free and on a taken slot; RLS on `payments` (other venue, `staff` role, anon); receipts bucket not readable by anon or `authenticated`.
- Webhook: bad signature, wrong amount, wrong currency, unknown ref, replayed event id, two deliveries at once (one applies).
- Race: two verified payments at once on one booking; a new quick booking against an expired hold.
- Unit: paid, balance and state labels; amount limits; receipt type and size checks.
- Playwright: Manager first upload receipt then verify; reject then re-upload; quick booking pay in sandbox auto-confirms; upload with JavaScript off; a redirect alone never confirms.

## Left to the builder

File layout inside `src/modules/payments`, function names, copy wording, migration split, how the hall auto-pick query is written, the exact alert layout.
