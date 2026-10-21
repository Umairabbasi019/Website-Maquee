-- Tenants module. RLS is enabled on every table; policies arrive in a later migration,
-- so until then nothing is readable by anon/authenticated.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id),
  slug text not null unique,
  name text not null,
  status text not null default 'setup' check (status in ('setup', 'live', 'paused')),
  time_zone text not null default 'Asia/Karachi',
  currency text not null default 'PKR',
  locale text not null default 'en',
  login_limit int not null default 5,
  manager_limit int not null default 2
);
create index tenants_account_id_idx on tenants (account_id);

create table tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  host text not null unique check (host = lower(host)),
  verified_at timestamptz
);
create index tenant_domains_tenant_id_idx on tenant_domains (tenant_id);

create table tenant_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  identity jsonb not null default '{}',
  theme jsonb not null default '{}',
  sections jsonb not null default '{}',
  money_rules jsonb not null default '{}',
  messaging jsonb not null default '{}',
  limits jsonb not null default '{}'
);

create table tenant_features (
  tenant_id uuid not null references tenants (id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  primary key (tenant_id, feature_key)
);

create table tenant_secrets (
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null,
  ciphertext text not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);

create table tenant_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null default '{}'
);

create table halls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  capacity_min int not null check (capacity_min >= 0),
  capacity_max int not null,
  is_active boolean not null default true,
  check (capacity_max >= capacity_min)
);
create index halls_tenant_id_idx on halls (tenant_id);

create table slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  buffer_minutes int not null default 0 check (buffer_minutes >= 0)
);
create index slots_tenant_id_idx on slots (tenant_id);

create function tenant_domains_lowercase_host() returns trigger
language plpgsql as $$
begin
  new.host := lower(new.host);
  return new;
end $$;

create trigger tenant_domains_lowercase_host
before insert or update on tenant_domains
for each row execute function tenant_domains_lowercase_host();

create function tenants_create_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into tenant_settings (tenant_id) values (new.id);
  return new;
end $$;

create trigger tenants_create_settings
after insert on tenants
for each row execute function tenants_create_settings();

alter table accounts enable row level security;
alter table tenants enable row level security;
alter table tenant_domains enable row level security;
alter table tenant_settings enable row level security;
alter table tenant_features enable row level security;
alter table tenant_secrets enable row level security;
alter table tenant_templates enable row level security;
alter table halls enable row level security;
alter table slots enable row level security;
