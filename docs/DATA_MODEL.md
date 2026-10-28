# Data Model

Postgres. Every tenant-owned table has `tenant_id uuid not null` (the venue's tenant) with a foreign key and an index that starts with `tenant_id`. Money is `bigint` paisa. Times are `timestamptz`; dates shown in the venue time zone.

## Tables by module

### tenants
- `accounts` (id, name)
- `tenants` (id, account_id, slug unique, name, status `setup|live|paused`, time_zone, currency, locale)
- `tenant_domains` (id, tenant_id, host unique, verified_at)
- `tenant_settings` (tenant_id pk, identity jsonb, theme jsonb, sections jsonb, money_rules jsonb, messaging jsonb, limits jsonb) — validated by Zod schemas in the module
- `tenant_features` (tenant_id, feature_key, enabled) pk (tenant_id, feature_key)
- `tenant_secrets` (tenant_id, kind, ciphertext, updated_by, updated_at) — never readable by clients
- `tenant_templates` (id, name, payload jsonb)
- `halls` (id, tenant_id, name, capacity_min, capacity_max, is_active, `hire_price_paisa` int null; M3) — writes audited by trigger, hire price needs `prices.edit`
- `slots` (id, tenant_id, name `lunch|dinner|…`, start_time, end_time, buffer_minutes)

### access
- `profiles` (user_id pk → auth users, full_name, phone)
- `platform_admins` (user_id pk)
- `permissions` (key pk, description) — seeded list from `JOURNEYS.md` (`venue.info.edit` added in M3)
- `roles` (id, tenant_id null for built-in, name)
- `role_permissions` (role_id, permission_key)
- `memberships` (id, tenant_id, user_id, role_id, is_active, deactivated_at) unique (tenant_id, user_id)
- `membership_overrides` (membership_id, permission_key, granted bool)
- `audit_events` (id, tenant_id null for platform, actor_user_id, actor_kind `user|provider|system`, action, entity, entity_id, before jsonb, after jsonb, reason, created_at) — insert-only

### catalogue
- Built: `event_types`, `packages` (price_per_guest_paisa, min_guests, event_type_id), `offers`, and in M3 `addons` (name, `price_paisa`, `basis` `flat|per_guest`, active, sort, sample) and `stage_themes` (name, description, `price_paisa`, `media_keys` text[], active, sort, sample). `offers` gained `discount_kind` (`percent|fixed`), `discount_value`, `starts_on`, `ends_on`, all null for a text-only offer.
- Not built: `menu_categories`, `menu_items`, `package_items` (menus stay as the package's item list).
- Writes on every catalogue table: RLS plus a column trigger that checks the permission key per column (price columns need `prices.edit`), and a publish-only trigger (see `DECISIONS.md`).

### calendar
- `date_blocks` (id, tenant_id, hall_id, during tstzrange, reason)
- `date_prices` (id, tenant_id, starts_on, ends_on inclusive, event_type_id null = all events, kind `percent|per_guest`, value int non-zero, label; M3). `percent` is -90..300; `per_guest` is paisa per guest. An exclusion constraint refuses overlap within one scope (all events, or one event type). Read with `bookings.view`, write with `calendar.manage`, writes audited by trigger. The pricing service applies them in M4.

### booking
Built in M4 (`supabase/migrations/20261027000100_booking.sql`). Only the server (service role) writes these tables; staff with `bookings.view` read their own venue's rows.
- `customers` (id, tenant_id, name, phone_e164, whatsapp_consent_at, marketing_consent_at, opted_out_at, created_at) unique (tenant_id, phone_e164). A returning phone keeps its first name; consent is only added.
- `bookings` (id, tenant_id, reference unique per tenant, customer_id, event_date, slot_id, `event_type_id` null, `event_type_name`, `package_id` null, `package_name` null, `addon_ids` uuid[], `addon_names` text[], guests, hall_id null until confirm, `during` tstzrange null until confirm, status, status_reason, current_quote_id, created_at). The names are snapshots: Publish may remove an event type or package, which sets its id to null (`on delete set null`) while the name stays. Add-on ids carry no foreign key for the same reason. A `confirmed` row must have a hall, a range and a quote.
- `booking_status_history` (id, tenant_id, booking_id, from_status, to_status, actor, reason, at). A trigger writes a row on insert and on every status change; `actor` is the `app.actor` the SQL functions set, null for a customer request.
- `quotes` (id, tenant_id, booking_id, version, snapshot jsonb, total_paisa, advance_paisa, created_by, created_at) unique (booking_id, version), insert-only (trigger). M4 writes version 1 at confirm. The snapshot holds the lines, tax, calculated and final totals, the override reason (null when unchanged) and the pricing inputs. The totals are `int`, checked `>= 0`.
- `access_tokens` (id, tenant_id, kind `booking|quote|invite`, target_id, token_hash unique, expires_at, revoked_at, created_at). Only the sha256 of the link token is stored; the booking link expires 60 days after the event date.
- `booking_ref_counters` (tenant_id, yymm, n) pk (tenant_id, yymm). Gives the `<PREFIX>-<YYMM>-<NNNN>` reference; PREFIX is the first two letters of the tenant slug, and NNNN is at least four digits (it widens past 9999, never fails).
- `booking_request_hits` (tenant_id, key_hash, at). Rate limit: 5 requests per hour per phone or IP-bucket hash, and 30 per hour per venue (rows with the fixed key_hash `venue`). Rows are never pruned in M4; the M7 job runner will.
- Not built yet: `enquiries`, `hold_expires_at`, `referral_code_id` (holds come with quick booking in M5, referrals in M9).

Statuses in M4: `requested`, `confirmed`, `declined`, `cancelled`. Allowed moves: `requested` to `confirmed`, `declined` or `cancelled`; `confirmed` to `cancelled`. The trigger `check_booking_update()` refuses any other move, and once a booking leaves `requested` its details are locked: a confirmed one can only be cancelled, and a declined or cancelled one never changes. The one exception is the event type and package ids, which may become null when Publish removes the row. A decline or cancel needs a reason. A request whose date has passed shows as "expired" on read; no status is stored. M5 adds `awaiting_advance`.

Status changes go through the service-role functions `confirm_booking()` (writes quote v1 and confirms in one transaction), `decline_booking()` and `cancel_booking()` (`20261027000300_booking_staff_fns.sql`). A public request goes through `create_booking_request()` (`20261027000200_booking_request_fn.sql`): rate limit, customer, reference, booking and token in one transaction. None of these is callable by browsers.

### payments
- `payments` (id, tenant_id, booking_id, kind `advance|balance|refund|adjustment`, method, amount_paisa, status `pending|verified|failed|refund_pending|refunded`, provider, provider_ref, recorded_by, verified_by, created_at) unique (provider, provider_ref)
- `receipts` (id, tenant_id, payment_id, storage_path, uploaded_at)
- `provider_events` (id, provider, event_id unique, payload, processed_at) — idempotency

### notifications
- `message_templates` (id, tenant_id, key, channel, body, provider_template_name, approved)
- `messages` (id, tenant_id, customer_id or user_id, template_key, channel, status `recorded|queued|accepted|delivered|failed|ready_to_send`, provider_ref, dedupe_key unique, attempts, error, scheduled_for)

### marketing
- `campaigns` (id, tenant_id, kind, audience jsonb, template_key, status, starts_at)
- `campaign_sends` (campaign_id, message_id)
- `referral_codes` (id, tenant_id, customer_id, code unique per tenant, discount jsonb)

### invites, operations, media
- `invites` (id, tenant_id, booking_id, content jsonb, expires_at) · `rsvps` (invite_id, name, guests, created_at)
- `duty_shifts` (id, tenant_id, user_id, booking_id null, starts_at, ends_at, role_label)
- `media_assets` as built: (id, tenant_id, key, alt, category `hero|room|stage|gallery|event|logo|seo`, source, licence, sizes text[] of `s|m|l|depth`, ext, `dims` jsonb with pixel sizes per size, unique (tenant_id, key)). Files sit in the `venue-media` bucket at `<tenant_id>/<key>/<size>.<ext>`.
- `site_drafts` (tenant_id pk, revision bigint from the global sequence `site_draft_revision_seq`, payload jsonb in the shape of `site_snapshot()`, changes jsonb itemKey → who and when, updated_at; M3). One draft per venue. Clients can read and delete it if they hold a site-editing key; only `save_site_draft()` (service role) writes it; `publish_site()` applies it.

## Double-booking rule

```sql
create extension if not exists btree_gist;
alter table bookings add constraint no_overlap
  exclude using gist (hall_id with =, during with &&)
  where (status = 'confirmed');
```
Only `confirmed` bookings count in M4. A request has no hall and no range, so requests never conflict and a taken date is accepted like any other. `during` is the slot on the event date in the venue time zone, widened by the slot's `buffer_minutes` at both ends; a slot whose end is not after its start ends the next day. Two slots whose buffered ranges overlap block each other in the same hall. Two managers confirming at once: `confirm_booking()` takes a per-hall advisory lock, so the second sees the first's committed row, gets `23P01` and the server turns it into a plain "slot just taken" message with nothing kept. When quick booking arrives in M5, the status list grows (`awaiting_advance`, with holds and `hold_expires_at`) and the constraint changes with it.

## RLS strategy

- RLS on every table. Helper functions (security definer, stable): `is_platform_admin()`, `auth_has_perm(tenant_id, key)` = active membership + role permission ± overrides.
- Select policy: `is_platform_admin() or auth_has_perm(tenant_id, '<module>.view')`. Write policies use the edit key.
- Public data (site config, catalogue) is read through server-side views or functions, not open tables. Availability is never public.
- Token pages resolve on the server with the service role after hashing and checking the token; they return only that booking's fields, never the full phone or a staff reason.
- Booking tables (M4): RLS is on for all seven. `customers`, `bookings`, `quotes` and `booking_status_history` have a select policy for `bookings.view` and no client write policy. `access_tokens`, `booking_ref_counters` and `booking_request_hits` have no policy and all rights are revoked from `anon` and `authenticated`. The trigger functions are revoked from clients too.
- `tenant_secrets` and `provider_events` have no client policies; `tenant_secrets` is also revoked from client roles. `audit_events` has a read-only policy for holders of `audit.view`; rows are added only through `record_audit()` and update/delete are blocked by trigger.
- Owner protection: below the super admin, an owner membership cannot be deactivated, deleted, re-roled or have its overrides edited, and nobody can assign the owner role. Only the super admin changes owners (`supabase/migrations/20261020000700_owner_protection.sql`).
- Published site content (event types, packages, offers, add-ons, stage themes, `tenant_settings`) cannot be written by a client outside Publish: a trigger refuses it unless `publish_site()` set `app.publishing`. Hall, slot and date price writes are direct but audited by trigger.
- Negative tests: user of tenant A cannot select, update or delete any tenant B row in every table; a booking token cannot read another booking; a deactivated user gets nothing.

## Indexes

`(tenant_id, …)` on every foreign-key lookup; `bookings (tenant_id, event_date)`; `enquiries (tenant_id, first_reply_at) where first_reply_at is null`; `messages (status, scheduled_for)`; `payments (tenant_id, booking_id)`; `access_tokens (token_hash)`.

## Retention

Bookings and payments kept for accounting (tenant-configurable, default 7 years). Invites and RSVPs deleted 90 days after the event. Opt-outs kept permanently. Tenant export before deletion.

## Seeds

Two demo tenants (Manor with sample prices labelled "sample", and a fictional second venue with a different theme), demo users per role, two sample `requested` bookings and one `confirmed` booking (with quote) for Manor, at 90 to 100 days out, written by `scripts/seed-bookings.ts`. More statuses come with later milestones.
