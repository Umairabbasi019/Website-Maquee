-- Catalogue: event types, packages and offers shown on the public site and (M3) used for quotes.
-- Money is integer paisa. Read needs bookings.view, write needs catalogue.edit (M3 adds prices.edit on price columns).
-- sample marks placeholder rows so the site can say so until the venue replaces them.

create table event_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  media_key text,
  sort int not null default 0,
  sample boolean not null default false,
  unique (tenant_id, slug),
  unique (tenant_id, id)
);

create table packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_type_id uuid not null,
  name text not null,
  price_per_guest_paisa int not null check (price_per_guest_paisa > 0),
  min_guests int not null check (min_guests > 0),
  items text[] not null,
  featured boolean not null default false,
  sort int not null default 0,
  sample boolean not null default false,
  -- Composite FK: a package can only belong to an event type of its own tenant.
  foreign key (tenant_id, event_type_id) references event_types (tenant_id, id) on delete cascade
);
create index packages_event_type_idx on packages (tenant_id, event_type_id);

create table offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  title text not null,
  body text not null,
  sort int not null default 0,
  active boolean not null default true,
  sample boolean not null default false
);
create index offers_tenant_id_idx on offers (tenant_id);

alter table event_types enable row level security;
alter table packages enable row level security;
alter table offers enable row level security;

create policy event_types_read on event_types for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy event_types_write on event_types for all to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));

create policy packages_read on packages for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy packages_write on packages for all to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));

create policy offers_read on offers for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy offers_write on offers for all to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
