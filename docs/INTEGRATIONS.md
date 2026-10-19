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
| Bank payment API or Pakistani gateway merchant account (bank API, JazzCash/Easypaisa merchant, Safepay) | Online auto-booking | Each venue | Admin console → tenant → Payments | When ready (adapter added then) |
| Bank, JazzCash, Easypaisa receiving details | Manual payments | Each venue | Tenant settings (not secret) | M5 |
| Email sender (e.g. Resend/SES) + verified domain | Backup notifications | Platform owner | `EMAIL_API_KEY` | M7 |
| Google Business Profile review link | Review requests | Each venue | Tenant settings | M7 |
| Job runner cron secret | Protecting `/api/jobs/run` | Platform owner | `JOBS_SECRET` | M4 |
| Error monitoring (optional, e.g. Sentry) | Alerts | Platform owner | `SENTRY_DSN` | M10 |

Until a service is connected, the app shows "not connected" or "ready to send" and keeps working through manual paths.
