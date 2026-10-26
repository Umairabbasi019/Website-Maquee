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
- Built: `event_types`, `packages` (per_guest_paisa, min_guests, event_type_id), `offers`, and in M3 `addons` (name, `price_paisa`, `basis` `flat|per_guest`, active, sort, sample) and `stage_themes` (name, description, `price_paisa`, `media_keys` text[], active, sort, sample). `offers` gained `discount_kind` (`percent|fixed`), `discount_value`, `starts_on`, `ends_on`, all null for a text-only offer.
- Not built: `menu_categories`, `menu_items`, `package_items` (menus stay as the package's item list).
- Writes on every catalogue table: RLS plus a column trigger that checks the permission key per column (price columns need `prices.edit`), and a publish-only trigger (see `DECISIONS.md`).

### calendar
- `date_blocks` (id, tenant_id, hall_id, during tstzrange, reason)
- `date_prices` (id, tenant_id, starts_on, ends_on inclusive, event_type_id null = all events, kind `percent|per_guest`, value int non-zero, label; M3). `percent` is -90..300; `per_guest` is paisa per guest. An exclusion constraint refuses overlap within one scope (all events, or one event type). Read with `bookings.view`, write with `calendar.manage`, writes audited by trigger. The pricing service applies them in M4.

### booking
- `customers` (id, tenant_id, name, phone_e164, whatsapp_consent_at, marketing_consent_at, opted_out_at)
- `enquiries` (id, tenant_id, customer_id, source, received_at, first_reply_at, assigned_to, status)
- `bookings` (id, tenant_id, reference unique per tenant, customer_id, hall_id, slot_id, during tstzrange, event_type_id, guests, status, hold_expires_at, current_quote_id, referral_code_id)
- `booking_status_history` (booking_id, from, to, actor, reason, at)
- `quotes` (id, tenant_id, booking_id, version, snapshot jsonb, total_paisa, advance_paisa, created_by, created_at) — immutable
- `access_tokens` (id, tenant_id, kind `booking|quote|invite`, target_id, token_hash unique, expires_at, revoked_at)

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
  where (status in ('held','quote_prepared','awaiting_advance','confirmed','planning','ready'));
```
Reserving runs in one transaction: first mark this hall's expired holds as `hold_expired`, then insert. Two people reserving at once: one insert wins, the other gets a clean "date just taken" message. Availability reads treat a hold past `hold_expires_at` as free. The job runner also expires holds every minute.

## RLS strategy

- RLS on every table. Helper functions (security definer, stable): `is_platform_admin()`, `auth_has_perm(tenant_id, key)` = active membership + role permission ± overrides.
- Select policy: `is_platform_admin() or auth_has_perm(tenant_id, '<module>.view')`. Write policies use the edit key.
- Public data (site config, catalogue, free/held/booked per date with no customer fields) is read through server-side views or functions, not open tables.
- Token pages resolve on the server with the service role after hashing and checking the token; they return only that booking's fields.
- `tenant_secrets` and `provider_events` have no client policies; `tenant_secrets` is also revoked from client roles. `audit_events` has a read-only policy for holders of `audit.view`; rows are added only through `record_audit()` and update/delete are blocked by trigger.
- Owner protection: below the super admin, an owner membership cannot be deactivated, deleted, re-roled or have its overrides edited, and nobody can assign the owner role. Only the super admin changes owners (`supabase/migrations/20261020000700_owner_protection.sql`).
- Published site content (event types, packages, offers, add-ons, stage themes, `tenant_settings`) cannot be written by a client outside Publish: a trigger refuses it unless `publish_site()` set `app.publishing`. Hall, slot and date price writes are direct but audited by trigger.
- Negative tests: user of tenant A cannot select, update or delete any tenant B row in every table; a booking token cannot read another booking; a deactivated user gets nothing.

## Indexes

`(tenant_id, …)` on every foreign-key lookup; `bookings (tenant_id, status, during)`; `enquiries (tenant_id, first_reply_at) where first_reply_at is null`; `messages (status, scheduled_for)`; `payments (tenant_id, booking_id)`; `access_tokens (token_hash)`.

## Retention

Bookings and payments kept for accounting (tenant-configurable, default 7 years). Invites and RSVPs deleted 90 days after the event. Opt-outs kept permanently. Tenant export before deletion.

## Seeds

Two demo tenants (Manor with sample prices labelled "sample", and a fictional second venue with a different theme), demo users per role, sample bookings across statuses.
