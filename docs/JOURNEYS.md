# User Journeys and Permissions

## Journeys

### J1 Customer requests a date
Built in M4; M5 adds the payment panel (J1a) and quick booking (J2).
1. Opens the venue site and taps "Request booking" (a package's button carries the choice into the form).
2. Opens `/book`. Every future date is open; the form never shows whether a day is taken. Picks date, time (slot), event, guests, package and add-ons, then name, phone and WhatsApp consent. If the manager turned the estimate on, a live "Estimate" shows the price without hall hire (or "Price on call" with no package). Works without JavaScript.
3. Submits and lands on `/book/sent`: "Request sent", the reference (for example `MA-2610-0042`) and a private link, with "The venue will contact you to confirm the details." A phone or IP over 5 requests in an hour sees "Too many requests from here. Please try again in an hour, or call the venue." for every date alike.
4. Opens the link `/b/<token>` (noindex, no referrer, expires 60 days after the event; the phone is never shown in full). The page shows the reference, status, date, time, event, guests, package and add-ons, plus:
   - **Requested:** "Requested. The venue will contact you."
   - **Confirmed:** "Confirmed", the hall, the final locked total and the advance, and the payment panel (J1a). After a price change by the manager, only the total and the advance show, never the calculated lines or the reason.
   - **Declined or cancelled:** "This request was not confirmed. Please contact the venue." The staff reason is never shown.
   - **Expired** (a request past its date, never confirmed): "This request has passed its date."
5. An unknown or expired link, or one opened on another venue's host, gives the same 404.

### J1a Customer pays the advance by receipt (Manager first, the default)
Built in M5. After the manager confirms, the customer's `/b/<token>` page shows a payment panel. Nothing counts as paid until staff say so.
1. The panel shows total, paid (verified money only), balance, the advance and its due date, and the venue's bank, JazzCash and Easypaisa details for the methods the venue turned on and filled in.
2. The customer pays outside the site, then uploads a receipt: method, amount in rupees and one JPEG, PNG or WebP image up to 4 MB (checked by content). Works without JavaScript. At most 3 receipts wait at once and 10 uploads per hour per booking.
3. The row reads "Checking". A manager, owner or accounts user sees a "Receipts to review" alert, opens the booking, opens the receipt in a new tab, and either verifies it (changing the amount to what arrived if needed) or rejects it with a reason. A rejected row shows "Not accepted: <reason>" and the customer can upload again. A rejection never cancels the booking; if the event date has passed the owner is also alerted.
4. Staff can record cash or direct payments and refunds themselves, change the advance due date, and mark a trusted customer "Pays later". An unpaid advance past its date only raises an alert; nothing is cancelled.
5. Cancelling a booking with money paid asks the manager to choose "Keep the money" or "Refund due"; refund due stays an alert until recorded refunds cover the paid amount. Refunds are recorded by hand; no money is sent.

### J2 Customer books with quick booking and online payment
Built in M5. A manager or owner turns on `instantBooking` in Settings (it needs an advance above 0 and a package). The customer submits the same form; the server prices it, picks the first free hall by name and creates the booking as Awaiting advance with a hold of `holdHours`. If no hall is free it becomes a normal request. The customer pays on the booking link by receipt (staff verify) or, when online payment is on, with Pay online: the provider's signed webhook, never the return page, verifies the money and confirms the booking. A smaller verified payment is kept and the hold stays. If the hold had expired and the date was taken, the status becomes Refund pending and the manager is alerted. Online payment exists only with the sandbox provider until a real gateway is added (see `INTEGRATIONS.md`).

### J3 Family shares a quote
Customer taps "Share with family" on the estimate or booking link. Family members open a read-only quote page and can tap "Reserve this date" or contact the manager.

### J4 Invite and RSVP
After confirmation the family edits the invite (names, time, message) on the booking link and shares it. Guests open it, see the map, RSVP. Family sees totals and updates the final guest count.

### J5 Manager handles an enquiry
Gets WhatsApp alert → opens enquiry → timer shows time since arrival → calls or WhatsApps → logs outcome → prepares quote → follows the booking to Confirmed. Unanswered after the target: reminder, then owner alert.

### J6 Owner checks the business
Gets the morning summary at 9 AM. Opens the overview: today's events, money due, enquiries waiting, dates to fill, charts.

### J7 Manager fills an empty date
Opens "Dates to fill", sets a discount on a free Tuesday, taps "Promote this date". The public calendar shows "Special price"; matching opted-in leads get a WhatsApp offer; results appear in campaign stats.

### J8 Event day
Staff open today's run sheet on their phone: timings, hall, guests, menu, stage theme, notes, duty roster, balance to collect. Manager marks the event Completed; the review request goes out the next day.

### J9 Super admin onboards a new marquee
Console → New tenant → choose template → enter name, domain, numbers → upload logo and photos → set halls, events, packages, prices, payment accounts → invite the owner and managers → setup checklist all green → set Live.

### J10 Super admin changes another tenant
Console → open tenant (banner shows which tenant) → Dashboard → Edit site → change package prices → save to draft → Publish. Audit log for that tenant records the super admin's name.

### J11 Manager edits the site
Dashboard → Edit site. The page shows with a ✎ on every editable part. Manager taps ✎ on a package, changes the price (rupees), saves; the change goes to the draft, and the editor bar counts it. Phone view shows how it looks on a phone. Publish checks the draft and applies it in one step; the public site shows the new price. Discard returns the draft to the published site. A change that needs a key the manager lacks (for example a theme change saved by the super admin) stays in the draft and blocks Publish, listing the item.

### J12 Manager adds a photo
Dashboard → Media → Upload (JPEG, PNG or WebP, up to 15 MB) with alt text and a category. The server makes the sizes. Photos in use cannot be deleted. Replace uploads a new photo and swaps it into the draft; the old one can be deleted once unused. The photo shows on the site after Publish.

### J13 Seasonal price
Dashboard → Settings → Date prices: a date range, all events or one event type, percent or rupees per guest, a label. Overlap in the same scope is refused. The pricing service uses these from M4.

### J14 Manager confirms a request
Built in M4.
1. Signs in; the overview shows "New requests: N" and links to the list. (No alert is sent until M7.)
2. Opens Bookings, filters by status (Requested, Expired, Confirmed, Declined, Cancelled) or opens the Calendar month, which shows confirmed bookings and pending requests per day and slot. Only staff ever see booked days.
3. Opens a request: customer name and phone, choices, history. Calls the customer to settle details.
4. In the confirm form, picks a hall. Halls that do not fit the guest count are shown disabled with the reason. The quote preview follows the hall (without JavaScript, "Update quote" reloads it). A package or add-on that was removed since the request is named in the preview.
5. Optionally types a different final total with a reason of 3 to 300 characters. Only a holder of `quotes.override` sees these fields; the preview still shows the calculated total.
6. Confirms. The booking gets its hall and time, quote version 1 is stored, and the customer link shows the final total. If another booking just took that hall and time, the form says "This hall and time were just confirmed for another booking." and nothing is saved. A request whose date has passed cannot be confirmed.
7. To refuse, the manager declines a request with a reason (3 to 300 characters). To undo a confirmed booking, cancels it with a reason; the customer then sends a new request. A confirmed booking's price, date, slot and hall never change.

## Permission matrix

Keys are checked on the server and in RLS. S = super admin, O = venue owner, M = manager, A = accounts, St = staff. ✓ = granted by default, ○ = off by default but super admin can grant, – = never.

| Permission key | S | O | M | A | St |
|---|---|---|---|---|---|
| `platform.tenants.manage` (create, pause, delete, domains, features, login limit) | ✓ | – | – | – | – |
| `tenant.settings.edit` (identity, theme, sections, money rules except the estimate switch) | ✓ | ○ | ○ | – | – |
| `users.manage` (invite, roles, deactivate within tenant) | ✓ | ○ | – | – | – |
| `bookings.view` (list, detail, calendar, new-request count; customer name and phone) | ✓ | ✓ | ✓ | ✓ | – |
| `bookings.edit` (confirm, decline, cancel; a confirmed booking is locked) | ✓ | ✓ | ✓ | – | – |
| `quotes.override` (set a final total different from the calculated one, with a reason, at confirm) | ✓ | ✓ | ✓ | – | – |
| `calendar.manage` (block, hold, date pricing; edit date prices in Settings) | ✓ | ✓ | ✓ | – | – |
| `catalogue.edit` (menus, packages, add-ons, stage themes, offers) | ✓ | ✓ | ✓ | – | – |
| `prices.edit` (prices; also the customer estimate switch `showPriceEstimate`, and only that money rule) | ✓ | ✓ | ✓ | – | – |
| `venue.info.edit` (phones, opening hours, address, manager card) | ✓ | ✓ | ✓ | – | – |
| `media.manage` | ✓ | ✓ | ✓ | – | – |
| `payments.view` | ✓ | ✓ | ✓ | ✓ | – |
| `payments.verify` (manual receipts, refunds) | ✓ | ✓ | ✓ | ✓ | – |
| `enquiries.handle` | ✓ | ✓ | ✓ | – | – |
| `marketing.send` | ✓ | ✓ | ✓ | – | – |
| `reports.view` (charts, exports) | ✓ | ✓ | ○ | ○ | – |
| `schedule.manage` (duty roster) | ✓ | ✓ | ✓ | – | – |
| `schedule.view_own` and run sheets for own events | ✓ | ✓ | ✓ | ✓ | ✓ |
| `audit.view` | ✓ | ✓ | – | – | – |

Owner memberships (built-in owner role) are created, changed, deactivated and deleted only by the super admin, even when an owner holds `users.manage`. An owner with it manages the other staff.

Customer (no login) with a valid booking token: view own booking and its final price (M4), payments and upload a receipt (M5); later also edit invite and final details until the cutoff (M8). Nothing else.

Rules:
- The super admin's grants per user override role defaults; "never" cells cannot be granted below super admin.
- Every key is scoped to one tenant except `platform.*`.
- Every write is audited with user, tenant, action, before/after.
