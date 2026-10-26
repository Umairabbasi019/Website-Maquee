# User Journeys and Permissions

## Journeys

### J1 Customer books a date (manual payment)
1. Opens the venue site, taps "Check a date".
2. Calendar shows free dates with prices; picks one.
3. Picks event, guests, package; sees itemised estimate and advance.
4. Taps "Reserve this date", enters name, phone, WhatsApp consent.
5. Gets reference number, WhatsApp message and private booking link. Date is held 48 h.
6. Manager is alerted, finalises the quote. Customer sees it on the booking link.
7. Customer transfers the advance and uploads the receipt.
8. Manager or Accounts verifies the money. Booking becomes Confirmed; customer and manager get WhatsApp confirmation.
9. Reminders follow for balance, final guest count, menu lock.

### J2 Customer books with online payment (after the provider is connected)
Steps 1–6 as J1 (or instant booking skips step 6). Customer pays on the booking link. The provider confirms to the server, and the booking becomes Confirmed automatically. If the hold had expired and the date was taken, the status becomes Refund pending and the manager is alerted.

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
Console → open tenant (banner shows which tenant) → edit menu prices → save. Audit log for that tenant records the super admin's name.

### J11 Manager edits the site
Dashboard → Edit site. The page shows with a ✎ on every editable part. Manager taps ✎ on a package, changes the price (rupees), saves; the change goes to the draft, and the editor bar counts it. Phone view shows how it looks on a phone. Publish checks the draft and applies it in one step; the public site shows the new price. Discard returns the draft to the published site. A change that needs a key the manager lacks (for example a theme change saved by the super admin) stays in the draft and blocks Publish, listing the item.

### J12 Manager adds a photo
Dashboard → Media → Upload (JPEG, PNG or WebP, up to 15 MB) with alt text and a category. The server makes the sizes. Photos in use cannot be deleted. Replace uploads a new photo and swaps it into the draft; the old one can be deleted once unused. The photo shows on the site after Publish.

### J13 Seasonal price
Dashboard → Settings → Date prices: a date range, all events or one event type, percent or rupees per guest, a label. Overlap in the same scope is refused. The pricing service uses these from M4.

## Permission matrix

Keys are checked on the server and in RLS. S = super admin, O = venue owner, M = manager, A = accounts, St = staff. ✓ = granted by default, ○ = off by default but super admin can grant, – = never.

| Permission key | S | O | M | A | St |
|---|---|---|---|---|---|
| `platform.tenants.manage` (create, pause, delete, domains, features, login limit) | ✓ | – | – | – | – |
| `tenant.settings.edit` (identity, theme, sections, money rules) | ✓ | ○ | ○ | – | – |
| `users.manage` (invite, roles, deactivate within tenant) | ✓ | ○ | – | – | – |
| `bookings.view` | ✓ | ✓ | ✓ | ✓ | – |
| `bookings.edit` (status, quote, details) | ✓ | ✓ | ✓ | – | – |
| `quotes.override` (with reason) | ✓ | ✓ | ✓ | – | – |
| `calendar.manage` (block, hold, date pricing; edit date prices in Settings) | ✓ | ✓ | ✓ | – | – |
| `catalogue.edit` (menus, packages, add-ons, stage themes, offers) | ✓ | ✓ | ✓ | – | – |
| `prices.edit` | ✓ | ✓ | ✓ | – | – |
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

Customer (no login) with a valid booking token: view own booking, quote, payments; upload receipt; edit invite and final details until the cutoff. Nothing else.

Rules:
- The super admin's grants per user override role defaults; "never" cells cannot be granted below super admin.
- Every key is scoped to one tenant except `platform.*`.
- Every write is audited with user, tenant, action, before/after.
