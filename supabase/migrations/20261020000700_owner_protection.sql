-- Owner protection: below platform admin, an owner membership (built-in owner role) cannot be
-- deactivated, deleted, re-roled or have its overrides edited, and nobody may assign the owner
-- role. Only the super admin creates and changes owners, even for a holder of users.manage.

create function public.is_owner_role(p_role uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.roles where id = p_role and tenant_id is null and name = 'owner');
$$;

create function public.is_owner_membership(p_membership uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where id = p_membership and public.is_owner_role(role_id));
$$;

-- Same as 20261020000200, plus the owner rule right after the bypass; also fires on delete.
create or replace function public.check_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role_tenant uuid;
begin
  if tg_op <> 'DELETE' then
    select tenant_id into v_role_tenant from public.roles where id = new.role_id;
    if v_role_tenant <> new.tenant_id then -- null (built-in role) passes
      raise exception 'role belongs to another tenant' using errcode = '42501';
    end if;
  end if;
  if current_setting('role') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  if (tg_op <> 'INSERT' and public.is_owner_role(old.role_id))
     or (tg_op <> 'DELETE' and public.is_owner_role(new.role_id)) then
    raise exception 'only a platform admin can change an owner membership or assign the owner role'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
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

drop trigger memberships_check_change on memberships;
create trigger memberships_check_change
before insert or update or delete on memberships
for each row execute function public.check_membership_change();

-- Same as 20261020000200, plus the owner rule right after the bypass.
create or replace function public.check_override_change() returns trigger
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
  if (tg_op <> 'INSERT' and public.is_owner_membership(old.membership_id))
     or (tg_op <> 'DELETE' and public.is_owner_membership(new.membership_id)) then
    raise exception 'only a platform admin can change the overrides of an owner membership'
      using errcode = '42501';
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

revoke execute on function public.is_owner_role(uuid), public.is_owner_membership(uuid) from public, anon, authenticated;
