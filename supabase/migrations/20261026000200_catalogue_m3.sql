-- M3 catalogue: add-ons, stage themes and offer discounts, all in integer paisa.
-- Writes are split by column: catalogue.edit for the rows, prices.edit for price columns
-- (tenant.settings.edit for an event's background). RLS lets either key reach a row; check_column_perms narrows it.
-- Clients write only through publish_site (require_publishing). Server sessions are trusted.

create table addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  price_paisa int not null check (price_paisa > 0),
  basis text not null check (basis in ('flat', 'per_guest')),
  active boolean not null default true,
  sort int not null default 0,
  sample boolean not null default false
);
create index addons_tenant_id_idx on addons (tenant_id);

create table stage_themes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_paisa int not null check (price_paisa > 0),
  media_keys text[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0,
  sample boolean not null default false
);
create index stage_themes_tenant_id_idx on stage_themes (tenant_id);

-- percent is 1-100; fixed is paisa off the total.
alter table offers
  add column discount_kind text check (discount_kind in ('percent', 'fixed')),
  add column discount_value int,
  add column starts_on date,
  add column ends_on date,
  add constraint offers_discount_pair check ((discount_kind is null) = (discount_value is null)),
  add constraint offers_discount_percent check (discount_kind <> 'percent' or discount_value between 1 and 100),
  add constraint offers_discount_fixed check (discount_kind <> 'fixed' or discount_value > 0),
  add constraint offers_dates check (ends_on >= starts_on);

alter table addons enable row level security;
alter table stage_themes enable row level security;

-- TG_ARGV[0] is the row key; each further '<key>:<column>' pair moves that column to its own key.
-- INSERT/DELETE need the row key (INSERT also each pair key whose column is set);
-- UPDATE needs the row key only if a column outside the pairs changed, and each pair key whose column changed.
create function public.check_column_perms() returns trigger
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

-- shortcut: any session that can run raw SQL as a client role could set app.publishing itself (PostgREST cannot),
-- move publish writes into SECURITY DEFINER functions and drop the client write policies if clients ever get raw SQL.
create function public.require_publishing() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('role') in ('authenticated', 'anon')
     and current_setting('app.publishing', true) is distinct from 'on' then
    raise exception 'edit through the site editor' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function public.check_column_perms(), public.require_publishing() from public, anon;

create trigger event_types_publish_only before insert or update or delete on event_types
  for each row execute function public.require_publishing();
create trigger packages_publish_only before insert or update or delete on packages
  for each row execute function public.require_publishing();
create trigger offers_publish_only before insert or update or delete on offers
  for each row execute function public.require_publishing();
create trigger addons_publish_only before insert or update or delete on addons
  for each row execute function public.require_publishing();
create trigger stage_themes_publish_only before insert or update or delete on stage_themes
  for each row execute function public.require_publishing();

create trigger event_types_column_perms before insert or update or delete on event_types
  for each row execute function public.check_column_perms('catalogue.edit', 'tenant.settings.edit:media_key');
create trigger packages_column_perms before insert or update or delete on packages
  for each row execute function public.check_column_perms('catalogue.edit', 'prices.edit:price_per_guest_paisa');
create trigger offers_column_perms before insert or update or delete on offers
  for each row execute function public.check_column_perms('catalogue.edit', 'prices.edit:discount_kind', 'prices.edit:discount_value');
create trigger addons_column_perms before insert or update or delete on addons
  for each row execute function public.check_column_perms('catalogue.edit', 'prices.edit:price_paisa');
create trigger stage_themes_column_perms before insert or update or delete on stage_themes
  for each row execute function public.check_column_perms('catalogue.edit', 'prices.edit:price_paisa');

drop policy event_types_write on event_types;
drop policy packages_write on packages;
drop policy offers_write on offers;

create policy addons_read on addons for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy stage_themes_read on stage_themes for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));

create policy event_types_insert on event_types for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy event_types_delete on event_types for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy event_types_update on event_types for update to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit')
         or public.auth_has_perm(tenant_id, 'tenant.settings.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit')
              or public.auth_has_perm(tenant_id, 'tenant.settings.edit'));

create policy packages_insert on packages for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy packages_delete on packages for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy packages_update on packages for update to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'));

create policy offers_insert on offers for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy offers_delete on offers for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy offers_update on offers for update to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'));

create policy addons_insert on addons for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy addons_delete on addons for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy addons_update on addons for update to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'));

create policy stage_themes_insert on stage_themes for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy stage_themes_delete on stage_themes for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy stage_themes_update on stage_themes for update to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'))
  with check (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit'));
