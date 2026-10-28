# M4 Booking requests and pricing — design

Date: 2026-10-27. Status: draft for owner review.

## Intent

A customer picks a date on the public site and sends a booking request. The manager calls them, settles the details, and confirms or declines in the dashboard. The customer keeps a private link that shows the booking details and, once confirmed, the final locked price.

The venue owner wants customers to see an open calendar. The customer must never learn that a date is already taken. Only staff see which days are booked.

Payment and automatic booking come in M5 as a manager switch ("quick booking"). M4 builds the request-and-confirm path that quick booking will later skip.

## What the owner decided

- The customer calendar shows every future date as open. Booked dates are never marked, and a request for a taken date is accepted like any other.
- After a request, the manager contacts the customer. Only a manager confirms.
- Only staff see booked days, in the dashboard.
- Two functions can happen on one day, for example lunch and dinner. These are the existing slots from M3.
- Showing a price estimate to the customer is a manager setting.
- At confirm, the system proposes the calculated price. The manager can change it.
- The customer link shows the booking details and the final locked price.
- In M5 the manager gets a switch to enable quick booking (pay and auto-book). It is out of scope for M4.

## Goals

1. **Public booking request flow.** Date, slot, event type, guests, package, optional add-ons, then name, phone and WhatsApp consent. Submit creates a request and shows a reference (for example `MM-2611-0042`) and a private link.
2. **Pricing service.** One tested server-side function. It turns a request plus the venue's catalogue, hall, date prices and money rules into an itemised quote in integer paisa. The browser never sends a total.
3. **Estimate on the request form**, only when the manager's `showPriceEstimate` setting is on.
4. **Dashboard bookings screen.**
   - A month calendar of confirmed bookings and pending requests per date and slot.
   - A list filtered by status.
   - A request detail view with Confirm, Decline and Cancel.
5. **Confirm step.**
   - The manager picks the hall, which is required.
   - The system shows the calculated quote, and the manager may override the total.
   - Confirming writes an immutable quote snapshot and sets the booking to `confirmed`.
6. **Double booking blocked in the database.** Two `confirmed` bookings in the same hall cannot overlap in time. When two managers confirm at once, one wins and the other gets a clear "this slot was just confirmed for another booking" message.
7. **Customer booking page** at `/b/<token>`:
   - noindex, unguessable, expiring.
   - It shows the reference, status, date, slot, event, guests, package and add-ons.
   - Once confirmed, it also shows the final locked price and the advance amount from money rules.
   - Phone numbers are never shown in full.
8. **State machine with history.** Every status change records who, when, from, to and why.

## Non-goals (M4)

- Payments, quick booking and auto-booking (M5).
- Holds and hold expiry. A request blocks nothing, so there is no hold timer and no job runner in M4. The job runner moves to M7.
- Notifications to the manager or customer (M7). New requests show as a count on the dashboard overview.
- The shareable family quote page, BKG-8 (moved to M8).
- Staff creating bookings by hand for phone or walk-in customers (later in M6 with the bookings table).
- Offers, referral discounts and decor pricing. The pricing service accepts no input for them yet.

## Anti-goals

- Any public response, timing or message that reveals whether a date or slot is booked.
- A price total trusted from the browser.
- A booking confirmed by anything other than a staff action with `bookings.edit`.

## Changes to earlier documents

The requirements and data model assumed public availability and holds. The owner's decision replaces that for M4. Record it in DECISIONS.md and update:

- **BKG-1:** the public calendar shows no availability. The staff calendar shows bookings.
- **BKG-3:** no holds in request mode. Holds come back with quick booking in M5, using the existing `holdHours`.
- **BKG-4:** the database blocks overlapping `confirmed` bookings. Requests never conflict.
- **ROADMAP M4 acceptance:**
  - A customer sends a request for any future date and gets a reference and a link.
  - Two simultaneous confirms of the same hall, date and slot: only one succeeds.
- **DATA_MODEL:** the exclusion constraint's status list for M4 is `confirmed` only. Statuses as below.

## Data (builder may refine names)

- **`customers`**, per DATA_MODEL. Upsert by `(tenant_id, phone_e164)`.
- **`bookings`**:
  - Columns: `reference` unique per tenant, `customer_id`, `event_date` date, `slot_id`, `hall_id` null until confirm, `during` tstzrange null until confirm, `event_type_id`, `package_id` null, `addon_ids` uuid[], `guests`, `status`, `current_quote_id`, `created_at`.
  - `during` comes from the event date plus the slot's start and end in the venue time zone (`moneyRules.timeZone`), with the slot's `buffer_minutes` added to both ends.
  - Exclusion constraint: `exclude using gist (hall_id with =, during with &&) where (status = 'confirmed')`.
- **`booking_status_history`**, per DATA_MODEL.
- **`quotes`**, immutable, per DATA_MODEL.
  - The snapshot holds the line items, `calculated_total_paisa`, `final_total_paisa`, `override_reason` (null when unchanged), `advance_paisa`, `tax_paisa`, and the inputs used.
  - An insert-only rule is enforced in the database.
- **`access_tokens`** with kind `booking`, per DATA_MODEL. Only the hash is stored. Expiry is 60 days after the event date. *My call.*
- **Money rules:** add `showPriceEstimate` boolean, default `true` (*my call*). It is editable on the existing Settings money-rules form with `prices.edit`.
- Every new table gets RLS plus negative cross-tenant tests, as in M1–M3.

## Statuses (M4)

```
requested -> confirmed | declined | cancelled
confirmed -> cancelled
```

- Decline and cancel need a reason.
- Requests whose date has passed show as "expired" on read. No stored status and no job. *My call.*
- M5 adds `awaiting_advance` and the quick-booking path.
- The transition table lives in one place in the booking module, and the database refuses any transition outside it.

## Pricing rules

- **Line items:**
  - hall hire (only once a hall is chosen)
  - package per-guest price × guests
  - each add-on (its own price rule from the catalogue)
  - the date price adjustment from `date_prices` matching the date and event type (`percent` applies to the subtotal; `per_guest` is paisa × guests)
  - tax at `taxPercent` on the subtotal after the date adjustment
- **Advance:** `advancePercent` of the final total.
- **Rounding:** every percentage rounds half up to the whole rupee (100 paisa). Rounding happens once per line, never on the running total. Document this in the module. *My call; the builder may choose another documented rule if PKR practice differs.*
- **Customer estimate:** excludes hall hire, because no hall is chosen yet, and is labelled "Estimate". It is computed on the server from the submitted choices.
- **Override:**
  - An override needs `quotes.override` and a reason.
  - It is audited.
  - The snapshot keeps both the calculated and the final totals.
  - Advance and tax are recalculated from the final total. *My call: tax is treated as included in the overridden total.*

## Public form behaviour

- **Without JS:** a plain HTML form posting to a server action, with a native `<input type="date">`. The JS calendar is an enhancement only. Reduced motion is respected.
- **Validation at the boundary (Zod):**
  - the date is today or later, within 18 months (*my call*)
  - the slot, event type, package and add-ons belong to this tenant and are active
  - guests is between 1 and the largest active hall capacity
  - the phone is a valid Pakistani mobile number, normalised to E.164
  - the name is 1–80 characters
- **Abuse limits:**
  - a honeypot field
  - per-phone and per-IP-hash limits (5 requests per hour, *my call*), stored server-side
- The limit message is the same for every date, so it reveals nothing about availability.
- The tenant comes from the host, never from the form.
- **Success page:** shows the reference and the private link, with "the venue will contact you".

## Dashboard

- **Permissions:**
  - the screen needs `bookings.view`
  - confirm, decline and cancel need `bookings.edit`
  - a price override needs `quotes.override`
- **Calendar and list** show the customer name and phone to staff only.
- **Confirm form:**
  - Hall select, filtered to halls whose capacity fits the guest count. The others are shown disabled with the reason.
  - Quote preview.
  - Optional override total with a reason.
  - The confirm button.
- **On overlap**, the constraint error turns into a plain message, and nothing is half-saved.

## Tests

- **Pricing unit tests:** rounding, date-price percent and per-guest, tax, advance, override recalculation, missing package.
- **DB tests:**
  - RLS negatives on every new table
  - the exclusion constraint, including a concurrent confirm where exactly one succeeds
  - the transition guard
  - quotes are immutable
  - a token cannot read another booking
- **Unit tests:** form validation, and the abuse-limit responses being identical.
- **Playwright:**
  - a customer sends a request and opens the link
  - a manager confirms with an override
  - the customer link shows the final price
  - a second confirm on the same slot is refused
  - the form works with JS disabled

## Settled after builder check (my calls)

- **Slot past midnight:** when `end_time <= start_time`, the slot ends the next day. Two slots whose buffered ranges overlap block each other in the same hall. That is intended, because it is the same room.
- **Reference:** `<PREFIX>-<YYMM>-<NNNN>`.
  - PREFIX is the first two letters of the tenant slug, upper case.
  - The counter is per tenant per month and comes from a counter table updated in the same transaction. No gaps matter.
- **Public writes:** a server action resolves the tenant from the host and inserts through the service role inside the booking module's server code. This is the same trust path as token pages. There are no anon RLS policies.
- **Hall hire:** a null `hire_price_paisa` counts as 0.
- **Package:** optional. With no package, the quote has no package line. If the estimate setting is on and there is no package, the estimate shows "Price on call".
- **Override:** needs `quotes.override` only when the final total differs from the calculated one.
  - With an override, `tax_paisa = round_half_up(final × rate / (100 + rate))`, so tax is inside the total.
  - Advance is `advancePercent` of the final total.
  - Check which roles hold `quotes.override` by default. If none do, give it to owner and manager.
- **Expired or unknown token:** the same 404, noindex. Staff can't revoke or reissue tokens in M4.
- **Rate limit:** follow the `login_limits` migration pattern in a new table. The IP is hashed with a server secret from env.

## Owner answers after builder check

- A confirmed booking cannot be changed: not its price, date, slot or hall. To change anything, the manager cancels it and the customer sends a new request. There is one quote per booking in M4.
- Decline and cancel reasons are for staff only. The customer link shows "This request was not confirmed. Please contact the venue." *(Taken from the owner's "ok".)*

## Left to the builder

File layout inside a new `booking` module (public API through `index.ts`), the reference format details, the calendar component, and the exact migration split.
