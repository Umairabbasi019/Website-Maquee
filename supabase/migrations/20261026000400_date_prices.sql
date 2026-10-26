-- M3 date prices: seasonal or date-range price changes, all events or one event type.
-- percent is a change to the quote (-90..300); per_guest is paisa added per guest (any non-zero integer).
-- Ranges are inclusive. Within one scope (a tenant's all-events rules, or one event type) ranges cannot overlap;
-- an event-specific range may overlap an all-events one, and the pricing service (M4) applies the event-specific one.

create extension if not exists btree_gist with schema extensions;

create table date_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  event_type_id uuid,
  kind text not null check (kind in ('percent', 'per_guest')),
  value int not null check (value <> 0),
  label text not null check (length(label) between 1 and 60),
  check (ends_on >= starts_on),
  check (kind <> 'percent' or value between -90 and 300),
  foreign key (tenant_id, event_type_id) references event_types (tenant_id, id) on delete cascade,
  constraint date_prices_no_overlap exclude using gist (
    tenant_id with =,
    (coalesce(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
create index date_prices_tenant_id_idx on date_prices (tenant_id);

alter table date_prices enable row level security;

create policy date_prices_read on date_prices for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy date_prices_write on date_prices for all to authenticated
  using (public.auth_has_perm(tenant_id, 'calendar.manage'))
  with check (public.auth_has_perm(tenant_id, 'calendar.manage'));

create trigger date_prices_audit after insert or update or delete on date_prices
  for each row execute function public.audit_client_write();
