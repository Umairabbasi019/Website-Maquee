-- Super admin changes a tenant's login and manager caps. The new caps may not go below the
-- current active counts. The tenant row is locked first, the same lock check_membership_limits()
-- takes, so a concurrent invite cannot slip in between the count and the update.
create function public.set_tenant_limits(p_tenant uuid, p_login int, p_manager int) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_manager uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'set_tenant_limits: platform admin only' using errcode = '42501';
  end if;
  if p_login is null or p_manager is null or p_login not between 1 and 50 or p_manager not between 1 and 50 then
    raise exception 'set_tenant_limits: limits must be 1 to 50' using errcode = '22023';
  end if;

  perform 1 from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'set_tenant_limits: tenant not found' using errcode = 'P0002';
  end if;

  select id into v_manager from public.roles where tenant_id is null and name = 'manager';
  if (select count(*) from public.memberships where tenant_id = p_tenant and is_active) > p_login then
    raise exception using errcode = 'P0001', message = 'login_limit_below_active';
  end if;
  if (select count(*) from public.memberships
      where tenant_id = p_tenant and is_active and role_id = v_manager) > p_manager then
    raise exception using errcode = 'P0001', message = 'manager_limit_below_active';
  end if;

  update public.tenants set login_limit = p_login, manager_limit = p_manager where id = p_tenant;
end $$;

revoke execute on function public.set_tenant_limits(uuid, int, int) from public, anon;
grant execute on function public.set_tenant_limits(uuid, int, int) to authenticated;
