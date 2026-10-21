-- Per-tenant caps on active logins and active managers. The tenant row lock serialises concurrent
-- changes, so two sessions cannot both take the last seat. Only changes that add to an active
-- count are checked: deactivating, or editing a row that is already counted, always passes.
-- security definer: the acting client may have no UPDATE right on tenants, which for update needs.
create function public.check_membership_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_login_limit int;
  v_manager_limit int;
  v_manager uuid;
  v_adds_login boolean;
  v_adds_manager boolean;
begin
  if not new.is_active then
    return new;
  end if;
  v_adds_login := tg_op = 'INSERT' or not old.is_active or old.tenant_id <> new.tenant_id;
  select id into v_manager from public.roles where tenant_id is null and name = 'manager';
  v_adds_manager := new.role_id = v_manager
    and (v_adds_login or old.role_id is distinct from new.role_id);
  if not (v_adds_login or v_adds_manager) then
    return new;
  end if;

  select login_limit, manager_limit into v_login_limit, v_manager_limit
  from public.tenants where id = new.tenant_id for update;

  if v_adds_login and (select count(*) from public.memberships
                       where tenant_id = new.tenant_id and is_active and id <> new.id) >= v_login_limit then
    raise exception using errcode = 'P0001', message = 'login_limit_reached';
  end if;
  if v_adds_manager and (select count(*) from public.memberships
                         where tenant_id = new.tenant_id and is_active and role_id = v_manager
                           and id <> new.id) >= v_manager_limit then
    raise exception using errcode = 'P0001', message = 'manager_limit_reached';
  end if;
  return new;
end $$;

create trigger memberships_enforce_limits
before insert or update on memberships
for each row execute function public.check_membership_limits();

revoke execute on function public.check_membership_limits() from public, anon;
