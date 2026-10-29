# Sitemap and Routes

Tenant is resolved from the host name (custom domain or `slug.<platform-domain>`). The host only picks which site to show; it never grants access.

## Public site (per tenant, indexed)
| Route | Page |
|---|---|
| `/` | Cinematic one-page site (sections from config) |
| `/dates` | Live date and price calendar, start of booking |
| `/book` | Booking request form (date, time, event, guests, package, add-ons, name, mobile; live estimate when the venue shows it). Prefilled from `?date=&event=<slug>&slot=<name>&guests=&package=<id>` (the Contact and Packages "Request booking" links); indexed unless the site is setup or sample |
| `/book/sent?t=<token>` | Request sent: the reference (read from the stored booking) and the private link. noindex, nofollow, no referrer |
| `/stage-themes` | Stage theme preview |
| `/privacy`, `/terms`, `/cancellation` | Policies from tenant config |
| `/sitemap.xml`, `/robots.txt` | SEO |
| Later: `/halls/[slug]`, `/menu`, `/decor`, `/faq` | Planned pages |

## Customer pages (token links, noindex)
| Route | Page |
|---|---|
| `/b/[token]` | Booking: status, details, and once confirmed the locked total and advance (M4); from M5 the payment panel (paid, balance, account details, receipt upload, Pay online when the venue has it); final details later. Only on its own venue's host; unknown, expired or foreign tokens are the same 404. noindex, nofollow, `Referrer-Policy: same-origin` |
| `/pay/sandbox/[ref]` | Sandbox checkout with Pay and Fail buttons. Dev only: unavailable unless `PAYMENTS_SANDBOX=1` and not production. noindex, `Referrer-Policy: same-origin` |
| `/q/[token]` | Shareable family quote |
| `/i/[token]` | Invite and RSVP |
| `/r/[code]` | Referral landing → booking flow with code applied |

## Venue dashboard (login, noindex) under `/dashboard`
Each screen appears only if the user has its permission.
| Route | Screen | Permission |
|---|---|---|
| `/dashboard` | Overview: count of new requests, linking to the Requested list; payment alerts (receipts to review, advance overdue, refund due, online payment stuck, rejected after the event for the owner) | `bookings.view`; alerts `payments.verify` |
| `/dashboard/bookings` | Bookings table filtered by `?status=` (requested, expired, confirmed, awaiting advance, hold expired, refund pending, refunded, declined, cancelled) or `?alert=<name>` (the bookings a payment alert counts, recomputed on the server; needs `payments.verify`); CSV import/export later | `bookings.view` |
| `/dashboard/bookings/[id]` | Booking detail: customer, choices, stored quote, history; Confirm (hall, quote preview, override with `quotes.override`), Decline and Cancel with a staff-only reason (`bookings.edit`; Cancel asks keep the money or refund due when money is paid); ledger with verify, reject, record payment or refund, advance due date, pays later and check status (view `payments.view`, actions `payments.verify`); messages later | `bookings.view` |
| `/dashboard/bookings/receipt/[paymentId]` | GET: redirects to a 5-minute signed receipt URL (`no-store`, `noindex`, `no-referrer`); opens in a new tab | `payments.view` |
| `/dashboard/calendar` | Month calendar `?month=YYYY-MM` of requests and confirmed bookings (a list below md); dates to fill later | `bookings.view` / `calendar.manage` |
| `/dashboard/enquiries` | Enquiry tracker | `enquiries.handle` |
| `/dashboard/payments` | Planned for M6 (payment lists and reports); in M5 receipts and the ledger live on the booking page | `payments.view` |
| `/dashboard/events/[id]/run-sheet` | Run sheet | own event or `bookings.view` |
| `/dashboard/schedule` | Duty schedule | `schedule.view_own` |
| `/dashboard/marketing` | Campaigns and results | `marketing.send` |
| `/dashboard/reports` | Charts and exports | `reports.view` |
| `/dashboard/site` | Edit site: the public page with ✎ buttons, side panels, Laptop/Phone preview, draft and Publish | any of `catalogue.edit`, `prices.edit`, `venue.info.edit`, `tenant.settings.edit` |
| `/dashboard/media` | Media library | `media.manage` |
| `/dashboard/users` | Users and permissions | `users.manage` |
| `/dashboard/settings` | Venue settings: halls, slots, date prices, money rules (each section by its own key) | any of `tenant.settings.edit`, `calendar.manage`, `prices.edit` |
| `/dashboard/audit` | Audit log | `audit.view` |

## Editor support route (login, noindex)
| Route | Use |
|---|---|
| `/site-preview` | The draft rendered as the public page, shown inside the editor's phone preview. Editors only; never indexed |

## Super admin console (platform domain only, noindex) under `/admin`
| Route | Screen |
|---|---|
| `/admin` | Tenant list and health |
| `/admin/tenants/new` | Create from template |
| `/admin/tenants/[id]` | Setup checklist, settings, features, login limit, secrets, pause, export |
| `/admin/tenants/[id]/open` | Open the tenant's dashboard as super admin (banner shows tenant) |
| `/admin/templates` | Tenant templates |
| `/admin/audit` | Platform audit log |

## Server endpoints
| Route | Use |
|---|---|
| `/api/payments/webhook/[provider]` | Provider confirmations: raw body capped at 64 KB (413 above), signature checked, idempotent. The venue comes from the payment row, not the host |
| `/api/webhooks/whatsapp` | Delivery status, replies, STOP |
| `/api/jobs/run` | Job runner trigger (cron, secret-protected) |
