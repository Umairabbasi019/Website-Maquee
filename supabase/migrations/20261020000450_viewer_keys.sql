-- One definition of "which permission keys does the caller hold in each tenant".
-- auth_has_perm (RLS) and the server's getViewer both read it, so the rule lives here only.
-- Platform admins are not expanded: auth_has_perm and the Viewer flag cover them.

-- Active membership, tenant not paused. An explicit override wins over the role default.
-- platform.* keys are never held through a tenant.
create function public.viewer_keys() returns table (tenant_id uuid, key text)
language sql stable security definer set search_path = '' as $$
  select m.tenant_id, p.key
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  cross join public.permissions p
  where m.user_id = (select auth.uid())
    and m.is_active and t.status <> 'paused'
    and p.key not like 'platform.%'
    and coalesce(
      (select o.granted from public.membership_overrides o
       where o.membership_id = m.id and o.permission_key = p.key),
      exists (select 1 from public.role_permissions rp
              where rp.role_id = m.role_id and rp.permission_key = p.key)
    );
$$;

-- Role name per live membership, for display and the Viewer shape.
create function public.viewer_roles() returns table (tenant_id uuid, role text)
language sql stable security definer set search_path = '' as $$
  select m.tenant_id, r.name
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  join public.roles r on r.id = m.role_id
  where m.user_id = (select auth.uid()) and m.is_active and t.status <> 'paused';
$$;

create or replace function public.auth_has_perm(p_tenant uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.viewer_keys() v where v.tenant_id = p_tenant and v.key = p_key
  );
$$;

revoke execute on function public.viewer_keys(), public.viewer_roles() from public, anon;
grant execute on function public.viewer_keys(), public.viewer_roles() to authenticated, service_role;
