-- Access module: users, roles, permissions, memberships and the append-only audit log.
-- Policies live in 20261020000300_rls_tenants.sql.

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text
);

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table permissions (
  key text primary key,
  description text not null
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade, -- null = built-in role
  name text not null,
  unique nulls not distinct (tenant_id, name)
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_key text not null references permissions (key),
  primary key (role_id, permission_key)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references roles (id),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  unique (tenant_id, user_id)
);
create index memberships_user_id_idx on memberships (user_id);
create index memberships_role_id_idx on memberships (role_id);

create table membership_overrides (
  membership_id uuid not null references memberships (id) on delete cascade,
  permission_key text not null references permissions (key),
  granted boolean not null,
  primary key (membership_id, permission_key)
);

-- No foreign keys: the log must outlive the users and tenants it mentions,
-- and an FK action (set null / cascade) would be an update/delete it forbids.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid, -- null = platform event
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'provider', 'system')),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_events_tenant_id_created_at_idx on audit_events (tenant_id, created_at);

insert into permissions (key, description) values
  ('platform.tenants.manage', 'Create, pause and delete tenants; domains, features, login limit'),
  ('tenant.settings.edit', 'Identity, theme, sections, money rules'),
  ('users.manage', 'Invite, change roles, deactivate within the tenant'),
  ('bookings.view', 'View bookings'),
  ('bookings.edit', 'Change booking status, quote and details'),
  ('quotes.override', 'Override a quote, with a reason'),
  ('calendar.manage', 'Block dates, hold dates, date pricing'),
  ('catalogue.edit', 'Menus, packages, add-ons, stage themes, offers'),
  ('prices.edit', 'Edit prices'),
  ('media.manage', 'Manage photos and media'),
  ('payments.view', 'View payments'),
  ('payments.verify', 'Verify manual receipts, refunds'),
  ('enquiries.handle', 'Handle enquiries'),
  ('marketing.send', 'Send marketing campaigns'),
  ('reports.view', 'Charts and exports'),
  ('schedule.manage', 'Duty roster'),
  ('schedule.view_own', 'Own schedule and run sheets for own events'),
  ('audit.view', 'View the audit log');

insert into roles (name) values ('owner'), ('manager'), ('accounts'), ('staff');

-- Defaults are the ✓ cells of the permission matrix in docs/JOURNEYS.md.
insert into role_permissions (role_id, permission_key)
select r.id, k.key
from roles r
join (values
  ('owner', 'bookings.view'), ('owner', 'bookings.edit'), ('owner', 'quotes.override'),
  ('owner', 'calendar.manage'), ('owner', 'catalogue.edit'), ('owner', 'prices.edit'),
  ('owner', 'media.manage'), ('owner', 'payments.view'), ('owner', 'payments.verify'),
  ('owner', 'enquiries.handle'), ('owner', 'marketing.send'), ('owner', 'reports.view'),
  ('owner', 'schedule.manage'), ('owner', 'schedule.view_own'), ('owner', 'audit.view'),
  ('manager', 'bookings.view'), ('manager', 'bookings.edit'), ('manager', 'quotes.override'),
  ('manager', 'calendar.manage'), ('manager', 'catalogue.edit'), ('manager', 'prices.edit'),
  ('manager', 'media.manage'), ('manager', 'payments.view'), ('manager', 'payments.verify'),
  ('manager', 'enquiries.handle'), ('manager', 'marketing.send'), ('manager', 'schedule.manage'),
  ('manager', 'schedule.view_own'),
  ('accounts', 'bookings.view'), ('accounts', 'payments.view'), ('accounts', 'payments.verify'),
  ('accounts', 'schedule.view_own'),
  ('staff', 'schedule.view_own')
) as k (role_name, key) on k.role_name = r.name
where r.tenant_id is null;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

-- The caller's active membership in a tenant that is not paused, else null.
create function public.auth_membership(p_tenant uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
    and m.is_active and t.status <> 'paused';
$$;

-- True for platform admins. Otherwise: active membership, tenant not paused, and an explicit
-- override wins over the role default. platform.* keys are never held through a tenant.
create function public.auth_has_perm(p_tenant uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or (
    p_key not like 'platform.%'
    and coalesce(
      (select o.granted from public.membership_overrides o
       where o.membership_id = public.auth_membership(p_tenant) and o.permission_key = p_key),
      exists (select 1 from public.memberships m
              join public.role_permissions rp on rp.role_id = m.role_id
              where m.id = public.auth_membership(p_tenant) and rp.permission_key = p_key)
    )
  );
$$;

-- Clients (role authenticated/anon) are checked; server sessions (service_role, postgres) are trusted.
create function public.record_audit(
  p_tenant uuid, p_action text, p_entity text, p_entity_id uuid,
  p_before jsonb, p_after jsonb, p_reason text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if current_setting('role') in ('authenticated', 'anon')
     and not (public.is_platform_admin() or public.auth_membership(p_tenant) is not null) then
    raise exception 'record_audit: not allowed for this tenant' using errcode = '42501';
  end if;
  insert into public.audit_events
    (tenant_id, actor_user_id, actor_kind, action, entity, entity_id, before, after, reason)
  values
    (p_tenant, v_actor, case when v_actor is null then 'system' else 'user' end,
     p_action, p_entity, p_entity_id, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end $$;

create function public.audit_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;

create trigger audit_events_no_update_delete
before update or delete on audit_events
for each row execute function public.audit_events_append_only();

create trigger audit_events_no_truncate
before truncate on audit_events
for each statement execute function public.audit_events_append_only();

-- Below platform admin, the JOURNEYS.md matrix rules apply to clients (role authenticated/anon);
-- server sessions (service_role, postgres) are trusted. platform.* is never granted to a tenant.

-- Overrides: only a platform admin grants above role defaults (○/– cells). Others may only add
-- revokes, may remove a revoke only for a key they hold, and never touch their own membership.
create function public.check_override_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_user uuid;
begin
  if tg_op <> 'DELETE' and new.permission_key like 'platform.%' then
    raise exception 'platform permissions cannot be granted to a tenant member: %', new.permission_key
      using errcode = '42501';
  end if;
  if current_setting('role') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    select tenant_id, user_id into v_tenant, v_user from public.memberships where id = old.membership_id;
    if not found then
      return old; -- cascade from deleting the whole membership
    end if;
    if v_user = (select auth.uid()) then
      raise exception 'cannot change overrides on your own membership' using errcode = '42501';
    end if;
    if not old.granted and not public.auth_has_perm(v_tenant, old.permission_key) then
      raise exception 'cannot lift the revoke of %: acting user does not hold it', old.permission_key
        using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select user_id into v_user from public.memberships where id = new.membership_id;
    if v_user = (select auth.uid()) then
      raise exception 'cannot change overrides on your own membership' using errcode = '42501';
    end if;
    if new.granted then
      raise exception 'only a platform admin can grant % above role defaults', new.permission_key
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger membership_overrides_check_change
before insert or update or delete on membership_overrides
for each row execute function public.check_override_change();

-- Tenant custom roles: a key must be held by the actor and be an owner-role default.
create function public.check_role_permission_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  if new.permission_key like 'platform.%' then
    raise exception 'platform permissions cannot be granted to a tenant role: %', new.permission_key
      using errcode = '42501';
  end if;
  if current_setting('role') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;
  select tenant_id into v_tenant from public.roles where id = new.role_id;
  if v_tenant is null or not public.auth_has_perm(v_tenant, new.permission_key) then
    raise exception 'cannot grant %: acting user does not hold it', new.permission_key using errcode = '42501';
  end if;
  if not exists (select 1 from public.role_permissions rp
                 join public.roles r on r.id = rp.role_id
                 where r.tenant_id is null and r.name = 'owner' and rp.permission_key = new.permission_key) then
    raise exception 'cannot grant %: above the owner role defaults', new.permission_key using errcode = '42501';
  end if;
  return new;
end $$;

create trigger role_permissions_check_grant
before insert or update on role_permissions
for each row execute function public.check_role_permission_grant();

-- A membership's role must be built-in or from the same tenant. Below platform admin: user and
-- tenant never change (no takeover), your own role is fixed, and you may only assign a role
-- whose keys you hold.
create function public.check_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role_tenant uuid;
begin
  select tenant_id into v_role_tenant from public.roles where id = new.role_id;
  if v_role_tenant <> new.tenant_id then -- null (built-in role) passes
    raise exception 'role belongs to another tenant' using errcode = '42501';
  end if;
  if current_setting('role') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.tenant_id <> old.tenant_id then
      raise exception 'membership user and tenant cannot be changed' using errcode = '42501';
    end if;
    if new.role_id = old.role_id then
      return new;
    end if;
    if old.user_id = (select auth.uid()) then
      raise exception 'cannot change the role of your own membership' using errcode = '42501';
    end if;
  end if;
  if exists (select 1 from public.role_permissions rp
             where rp.role_id = new.role_id
               and not public.auth_has_perm(new.tenant_id, rp.permission_key)) then
    raise exception 'cannot assign role: acting user does not hold all of its permissions'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger memberships_check_change
before insert or update on memberships
for each row execute function public.check_membership_change();

revoke execute on function
  public.is_platform_admin(), public.auth_membership(uuid), public.auth_has_perm(uuid, text),
  public.record_audit(uuid, text, text, uuid, jsonb, jsonb, text),
  public.audit_events_append_only(), public.check_override_change(), public.check_role_permission_grant(),
  public.check_membership_change()
from public, anon;
grant execute on function
  public.is_platform_admin(), public.auth_membership(uuid), public.auth_has_perm(uuid, text),
  public.record_audit(uuid, text, text, uuid, jsonb, jsonb, text)
to authenticated, service_role;

alter table profiles enable row level security;
alter table platform_admins enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table memberships enable row level security;
alter table membership_overrides enable row level security;
alter table audit_events enable row level security;
