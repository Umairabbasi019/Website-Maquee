-- Clearing `sample` (true to false) is a side effect of any allowed edit, so it needs no key of its own:
-- a viewer with only prices.edit can change a seeded sample row's price. Setting sample back to true is a normal change.
-- Same function as 20261026000200_catalogue_m3.sql plus the sample rule; the TS mirror is requiredKeys in src/modules/editor/keys.ts.
create or replace function public.check_column_perms() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_tenant uuid := (coalesce(v_new, v_old) ->> 'tenant_id')::uuid;
  v_rest_old jsonb := v_old;
  v_rest_new jsonb := v_new;
  v_needed text[] := '{}';
  v_key text;
  v_col text;
begin
  if current_setting('role') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  for i in 1 .. tg_nargs - 1 loop
    v_key := split_part(tg_argv[i], ':', 1);
    v_col := split_part(tg_argv[i], ':', 2);
    if (tg_op = 'INSERT' and v_new -> v_col <> 'null'::jsonb)
       or (tg_op = 'UPDATE' and v_old -> v_col is distinct from v_new -> v_col) then
      v_needed := v_needed || v_key;
    end if;
    v_rest_old := v_rest_old - v_col;
    v_rest_new := v_rest_new - v_col;
  end loop;
  if tg_op = 'UPDATE' and v_old -> 'sample' = 'true'::jsonb and v_new -> 'sample' = 'false'::jsonb then
    v_rest_old := v_rest_old - 'sample';
    v_rest_new := v_rest_new - 'sample';
  end if;
  if tg_op <> 'UPDATE' or v_rest_old is distinct from v_rest_new then
    v_needed := tg_argv[0] || v_needed;
  end if;
  foreach v_key in array v_needed loop
    if not public.auth_has_perm(v_tenant, v_key) then
      raise exception 'needs %', v_key using errcode = '42501';
    end if;
  end loop;
  return coalesce(new, old);
end $$;

revoke execute on function public.check_column_perms() from public, anon;
