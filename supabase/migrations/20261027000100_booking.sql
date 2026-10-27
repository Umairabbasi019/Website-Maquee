-- M4 booking requests: customers, bookings, status history, immutable quotes, access tokens, reference counters and
-- request rate-limit hits. Only the server (service role) writes; staff with bookings.view read their own venue.
-- Statuses (M4): requested -> confirmed | declined | cancelled, confirmed -> cancelled. The database refuses the rest.

-- Composite keys so a booking can only point at rows of its own venue.
alter table halls add unique (tenant_id, id);
alter table slots add unique (tenant_id, id);
alter table packages add unique (tenant_id, id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_consent_at timestamptz,
  marketing_consent_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone_e164),
  unique (tenant_id, id)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  reference text not null,
  customer_id uuid not null,
  event_date date not null,
  slot_id uuid not null,
  event_type_id uuid not null,
  package_id uuid,
  addon_ids uuid[] not null default '{}',
  guests int not null check (guests > 0),
  hall_id uuid,
  during tstzrange,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  status_reason text,
  current_quote_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, reference),
  unique (tenant_id, id),
  check (status <> 'confirmed' or (hall_id is not null and during is not null and current_quote_id is not null)),
  check (status not in ('declined', 'cancelled') or status_reason is not null),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id),
  foreign key (tenant_id, slot_id) references slots (tenant_id, id) on delete restrict,
  foreign key (tenant_id, event_type_id) references event_types (tenant_id, id),
  foreign key (tenant_id, package_id) references packages (tenant_id, id),
  foreign key (tenant_id, hall_id) references halls (tenant_id, id),
  constraint no_overlap exclude using gist (hall_id with =, during with &&) where (status = 'confirmed')
);
create index bookings_tenant_date_idx on bookings (tenant_id, event_date);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid not null,
  version int not null check (version > 0),
  snapshot jsonb not null,
  total_paisa int not null check (total_paisa >= 0),
  advance_paisa int not null check (advance_paisa >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (booking_id, version),
  unique (booking_id, id),
  foreign key (tenant_id, booking_id) references bookings (tenant_id, id) on delete cascade
);
create index quotes_tenant_id_idx on quotes (tenant_id);

-- The current quote must be one of this booking's own quotes.
alter table bookings add foreign key (id, current_quote_id) references quotes (booking_id, id);

create table booking_status_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  booking_id uuid not null,
  from_status text,
  to_status text not null,
  actor uuid,
  reason text,
  at timestamptz not null default now(),
  foreign key (tenant_id, booking_id) references bookings (tenant_id, id) on delete cascade
);
create index booking_status_history_booking_idx on booking_status_history (tenant_id, booking_id);

-- Only the hash of a private link is stored.
create table access_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in ('booking', 'quote', 'invite')),
  target_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index access_tokens_tenant_id_idx on access_tokens (tenant_id);

create table booking_ref_counters (
  tenant_id uuid not null references tenants (id) on delete cascade,
  yymm text not null check (yymm ~ '^[0-9]{4}$'),
  n int not null check (n > 0),
  primary key (tenant_id, yymm)
);

-- shortcut: the table grows without bound, so prune rows older than a day in the M7 job runner.
create table booking_request_hits (
  tenant_id uuid not null references tenants (id) on delete cascade,
  key_hash text not null,
  at timestamptz not null default now()
);
create index booking_request_hits_key_idx on booking_request_hits (tenant_id, key_hash, at);

-- Transition table and the lock on a confirmed booking's details.
create function public.check_booking_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
    (old.status = 'requested' and new.status in ('confirmed', 'declined', 'cancelled'))
    or (old.status = 'confirmed' and new.status = 'cancelled')
  ) then
    raise exception 'invalid_transition: % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if old.status = 'confirmed' and (
    new.event_date, new.slot_id, new.hall_id, new.during, new.guests, new.package_id, new.addon_ids, new.current_quote_id
  ) is distinct from (
    old.event_date, old.slot_id, old.hall_id, old.during, old.guests, old.package_id, old.addon_ids, old.current_quote_id
  ) then
    raise exception 'booking_locked: a confirmed booking cannot change its details' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger bookings_transition before update on bookings
  for each row execute function public.check_booking_update();

-- Server functions set app.actor (transaction-local) to the acting user; unset means a system change.
create function public.record_booking_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.booking_status_history (tenant_id, booking_id, from_status, to_status, actor, reason)
  values (
    new.tenant_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
    nullif(current_setting('app.actor', true), '')::uuid, new.status_reason
  );
  return null;
end $$;

create trigger bookings_status_history_insert after insert on bookings
  for each row execute function public.record_booking_status();
create trigger bookings_status_history_update after update of status on bookings
  for each row when (old.status is distinct from new.status) execute function public.record_booking_status();

-- Quotes are insert-only. Deleting the venue (or its booking) still removes them.
create function public.refuse_quote_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.bookings b where b.id = old.booking_id) then
    return old;
  end if;
  raise exception 'quote_immutable: quotes cannot be changed or deleted' using errcode = 'P0001';
end $$;

create trigger quote_immutable before update or delete on quotes
  for each row execute function public.refuse_quote_change();

revoke execute on function public.check_booking_update(), public.record_booking_status(), public.refuse_quote_change()
  from public, anon, authenticated;

alter table customers enable row level security;
alter table bookings enable row level security;
alter table quotes enable row level security;
alter table booking_status_history enable row level security;
alter table access_tokens enable row level security;
alter table booking_ref_counters enable row level security;
alter table booking_request_hits enable row level security;

create policy customers_read on customers for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy bookings_read on bookings for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy quotes_read on quotes for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy booking_status_history_read on booking_status_history for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));

-- Token hashes, counters and rate-limit hits are server-only, even if a policy is added by mistake later.
revoke all on access_tokens, booking_ref_counters, booking_request_hits from anon, authenticated;
