-- M3 settings: field-level keys on tenant_settings, hall hire price, audited direct writes, media writes server-only.

-- Any editing key reaches the row; check_settings_write narrows it per field. Clients write only through publish_site.
drop policy tenant_settings_read on tenant_settings;
drop policy tenant_settings_update on tenant_settings;
create policy tenant_settings_read on tenant_settings for select to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit') or public.auth_has_perm(tenant_id, 'venue.info.edit')
         or public.auth_has_perm(tenant_id, 'catalogue.edit'));
create policy tenant_settings_update on tenant_settings for update to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit') or public.auth_has_perm(tenant_id, 'venue.info.edit')
         or public.auth_has_perm(tenant_id, 'catalogue.edit'))
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit') or public.auth_has_perm(tenant_id, 'venue.info.edit')
              or public.auth_has_perm(tenant_id, 'catalogue.edit'));

-- The listed paths need their own key; any other change to the row needs tenant.settings.edit.
create function public.check_settings_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_needed text[] := '{}';
  v_path text[];
  v_key text;
begin
  if current_setting('role') not in ('authenticated', 'anon') then
    return new;
  end if;
  for v_path, v_key in
    select f.path, f.key from (values
      ('{identity,phones}'::text[], 'venue.info.edit'),
      ('{identity,address}', 'venue.info.edit'),
      ('{identity,openingHours}', 'venue.info.edit'),
      ('{content,contact,manager}', 'venue.info.edit'),
      ('{content,gallery,tiles}', 'catalogue.edit'),
      ('{content,packages,defaultEvent}', 'catalogue.edit')
    ) as f (path, key)
  loop
    if v_old #> v_path is distinct from v_new #> v_path then
      v_needed := v_needed || v_key;
    end if;
    v_old := v_old #- v_path;
    v_new := v_new #- v_path;
  end loop;
  if v_old is distinct from v_new then
    v_needed := 'tenant.settings.edit'::text || v_needed;
  end if;
  foreach v_key in array v_needed loop
    if not public.auth_has_perm(new.tenant_id, v_key) then
      raise exception 'needs %', v_key using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- create_tenant_from_template (platform admin, SECURITY DEFINER) updates the new settings row, so the guard now
-- checks current_user: inside a SECURITY DEFINER function it is the owner, while direct PostgREST writes run as
-- authenticated/anon. Trusted definer functions write freely; clients still need app.publishing.
-- shortcut: a client-role session that can run raw SQL could set app.publishing itself (PostgREST cannot),
-- move publish writes into SECURITY DEFINER functions and drop the client write policies if clients ever get raw SQL.
create or replace function public.require_publishing() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and current_setting('app.publishing', true) is distinct from 'on' then
    raise exception 'edit through the site editor' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger tenant_settings_publish_only before update on tenant_settings
  for each row execute function public.require_publishing();
create trigger tenant_settings_field_perms before update on tenant_settings
  for each row execute function public.check_settings_write();

-- Halls stay venue setup (tenant.settings.edit); the hire price is a price (prices.edit). Saved directly, not through Publish.
alter table halls add column hire_price_paisa int check (hire_price_paisa > 0);

drop policy halls_write on halls;
create policy halls_insert on halls for insert to authenticated
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));
create policy halls_delete on halls for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));
create policy halls_update on halls for update to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit') or public.auth_has_perm(tenant_id, 'prices.edit'))
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit') or public.auth_has_perm(tenant_id, 'prices.edit'));

create trigger halls_column_perms before insert or update or delete on halls
  for each row execute function public.check_column_perms('tenant.settings.edit', 'prices.edit:hire_price_paisa');

-- Direct (non-Publish) client writes leave an audit row. Server sessions record their own audit.
create function public.audit_client_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  if current_setting('role') in ('authenticated', 'anon') then
    perform public.record_audit(
      (v_row ->> 'tenant_id')::uuid, tg_table_name || '.' || lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid,
      to_jsonb(old), to_jsonb(new), null
    );
  end if;
  return null;
end $$;

revoke execute on function public.check_settings_write(), public.audit_client_write() from public, anon;

create trigger halls_audit after insert or update or delete on halls
  for each row execute function public.audit_client_write();
create trigger slots_audit after insert or update or delete on slots
  for each row execute function public.audit_client_write();

-- Uploads go through the server (service role), which makes the variants; clients only read.
drop policy media_assets_write on media_assets;
