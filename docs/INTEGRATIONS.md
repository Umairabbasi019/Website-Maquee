# Integrations Checklist

Never paste secrets into chat. Keys go into the environment (platform) or the admin console (per tenant), which stores them encrypted.

| Service | Needed for | Who sets it up | Where the key goes | Needed by |
|---|---|---|---|---|
| Domain per venue (e.g. `manormarquee.pk`) + platform domain | Public sites, admin console | Platform owner | DNS records shown in admin console | Launch |
| Hosting: Vercel + Supabase, or a VPS | Running the app | Platform owner | Platform `.env` | Launch (decision pending) |
| Supabase project (or self-hosted Postgres + storage) | Database, logins, files | Platform owner | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | M1 (local dev uses Supabase CLI, no account) |
| Encryption key for tenant secrets | Storing payment/WhatsApp keys | Platform owner | `TENANT_SECRETS_KEY` | M1 |
| Meta Business account + verification | WhatsApp Cloud API | Each venue (help from platform owner) | Admin console → tenant → WhatsApp | M7 |
| WhatsApp Business number + approved templates | Automatic messages, marketing | Each venue | Admin console | M7 / M9 |
| Bank payment API or Pakistani gateway merchant account (bank API, JazzCash/Easypaisa merchant, Safepay) | Online auto-booking | Each venue | Admin console → tenant → Payments (the `payments` tenant secret; the webhook checks with it) | When ready. M5 built the provider interface and a dev-only sandbox; a real adapter is added on request after fee research |
| Bank, JazzCash, Easypaisa receiving details | Manual payments | Each venue | Tenant settings (`paymentAccounts`, not secret) | M5, built |
| Email sender (e.g. Resend/SES) + verified domain | Backup notifications | Platform owner | `EMAIL_API_KEY` | M7 |
| Google Business Profile review link | Review requests | Each venue | Tenant settings | M7 |
| Job runner cron secret | Protecting `/api/jobs/run` | Platform owner | `JOBS_SECRET` | M4 |
| Error monitoring (optional, e.g. Sentry) | Alerts | Platform owner | `SENTRY_DSN` | M10 |

Until a service is connected, the app shows "not connected" or "ready to send" and keeps working through manual paths.

## Payments as built (M5)

- Online payment uses one `PaymentProvider` per deployment, chosen by `availableProvider()`. Today that is the sandbox, only when `PAYMENTS_SANDBOX=1` and not a production build, so the `gateway` method cannot be switched on in production until a real adapter exists.
- To add a gateway: implement `PaymentProvider` in `src/modules/payments/providers/<vendor>.ts` (`newRef`, `createPayment`, `peekRef`, `verifyWebhook`, `getStatus`), register it in `availableProvider()`, save the venue's key as its `payments` secret, and point the gateway's webhook at `POST /api/payments/webhook/<provider id>`. Widen `getStatus` to return amount and currency at the same time (see `DECISIONS.md`).
- The sandbox signs the raw webhook body with HMAC-SHA256 using the venue's secret, header `x-sandbox-signature`. `npm run db:seed` gives Manor a random local key.
- Receipts are stored in the private `payment-receipts` bucket; no third-party storage is involved.
