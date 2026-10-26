-- M3 draft and Publish: one draft per venue (the whole site as SiteDraftSchema JSON), applied by publish_site()
-- in one transaction. The server writes drafts with the service role; clients only read and (through publish) delete them.

create table site_drafts (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  revision int not null default 1,
  payload jsonb not null,
  changes jsonb not null default '{}', -- itemKey -> { by uuid, name text, at timestamptz }
  updated_at timestamptz default now()
);

alter table site_drafts enable row level security;

create policy site_drafts_read on site_drafts for select to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit')
         or public.auth_has_perm(tenant_id, 'venue.info.edit') or public.auth_has_perm(tenant_id, 'tenant.settings.edit')
         or public.auth_has_perm(tenant_id, 'media.manage'));
create policy site_drafts_delete on site_drafts for delete to authenticated
  using (public.auth_has_perm(tenant_id, 'catalogue.edit') or public.auth_has_perm(tenant_id, 'prices.edit')
         or public.auth_has_perm(tenant_id, 'venue.info.edit') or public.auth_has_perm(tenant_id, 'tenant.settings.edit')
         or public.auth_has_perm(tenant_id, 'media.manage'));

-- The published site in the editor's shape (src/modules/editor/draft.ts SiteDraftSchema; camelCase row keys).
-- Invoker, so a client sees only what RLS lets it read.
create function public.site_snapshot(p_tenant uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'identity', s.identity, 'theme', s.theme, 'sections', s.sections, 'messaging', s.messaging, 'content', s.content,
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'name', e.name, 'description', e.description, 'mediaKey', e.media_key,
        'sort', e.sort, 'sample', e.sample) order by e.sort, e.id)
      from public.event_types e where e.tenant_id = p_tenant), '[]'),
    'packages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'eventTypeId', p.event_type_id, 'name', p.name, 'pricePerGuestPaisa', p.price_per_guest_paisa,
        'minGuests', p.min_guests, 'items', to_jsonb(p.items), 'featured', p.featured, 'sort', p.sort, 'sample', p.sample)
        order by p.sort, p.id)
      from public.packages p where p.tenant_id = p_tenant), '[]'),
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title, 'body', o.body, 'active', o.active, 'sort', o.sort, 'sample', o.sample,
        'discountKind', o.discount_kind, 'discountValue', o.discount_value, 'startsOn', o.starts_on, 'endsOn', o.ends_on)
        order by o.sort, o.id)
      from public.offers o where o.tenant_id = p_tenant), '[]'),
    'addons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'pricePaisa', a.price_paisa, 'basis', a.basis, 'active', a.active,
        'sort', a.sort, 'sample', a.sample) order by a.sort, a.id)
      from public.addons a where a.tenant_id = p_tenant), '[]'),
    'stageThemes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'description', t.description, 'pricePaisa', t.price_paisa,
        'mediaKeys', to_jsonb(t.media_keys), 'active', t.active, 'sort', t.sort, 'sample', t.sample) order by t.sort, t.id)
      from public.stage_themes t where t.tenant_id = p_tenant), '[]')
  )
  from public.tenant_settings s where s.tenant_id = p_tenant;
$$;

-- What changed between two snapshots: settings parts by top-level key (a non-object part whole),
-- catalogue parts by row id (rows added, removed or changed). Equal inputs give { before: {}, after: {} }.
create function public.site_diff(p_before jsonb, p_after jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_part text;
  v_old jsonb;
  v_new jsonb;
  v_b jsonb;
  v_a jsonb;
begin
  foreach v_part in array array['identity', 'theme', 'sections', 'messaging', 'content'] loop
    v_old := p_before -> v_part;
    v_new := p_after -> v_part;
    continue when v_old is not distinct from v_new;
    if jsonb_typeof(v_old) = 'object' and jsonb_typeof(v_new) = 'object' then
      select coalesce(jsonb_object_agg(k, v_old -> k) filter (where v_old ? k), '{}'),
             coalesce(jsonb_object_agg(k, v_new -> k) filter (where v_new ? k), '{}')
        into v_b, v_a
        from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) u (k)
        where v_old -> k is distinct from v_new -> k;
    else
      v_b := coalesce(v_old, 'null');
      v_a := coalesce(v_new, 'null');
    end if;
    v_before := v_before || jsonb_build_object(v_part, v_b);
    v_after := v_after || jsonb_build_object(v_part, v_a);
  end loop;

  foreach v_part in array array['events', 'packages', 'offers', 'addons', 'stageThemes'] loop
    select jsonb_agg(o.r order by o.r ->> 'id') filter (where o.r is not null),
           jsonb_agg(n.r order by n.r ->> 'id') filter (where n.r is not null)
      into v_b, v_a
      from jsonb_array_elements(coalesce(p_before -> v_part, '[]')) o (r)
      full join jsonb_array_elements(coalesce(p_after -> v_part, '[]')) n (r) on o.r ->> 'id' = n.r ->> 'id'
      where o.r is distinct from n.r;
    continue when v_b is null and v_a is null;
    v_before := v_before || jsonb_build_object(v_part, coalesce(v_b, '[]'));
    v_after := v_after || jsonb_build_object(v_part, coalesce(v_a, '[]'));
  end loop;

  return jsonb_build_object('before', v_before, 'after', v_after);
end $$;

-- Applies the draft at p_revision. Invoker: every write runs as the caller, so RLS and the column and settings
-- triggers check each changed key (a draft holding a change the caller has no key for fails as a whole).
-- Only differing rows and parts are written, so unchanged ones need no key. Any error rolls back everything,
-- the draft delete included.
create function public.publish_site(p_tenant uuid, p_revision int) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_tables constant jsonb := '{"events": "event_types", "packages": "packages", "offers": "offers",
                               "addons": "addons", "stageThemes": "stage_themes"}';
  v_before jsonb;
  v_after jsonb;
  v_diff jsonb;
  v_part text;
  v_table text;
  v_row jsonb;
  v_cols text;
  v_gone uuid[];
begin
  perform set_config('app.publishing', 'on', true);

  -- The delete locks the one draft row: a second publish of the same revision waits here, then finds no row.
  delete from public.site_drafts where tenant_id = p_tenant and revision = p_revision returning payload into v_after;
  if v_after is null then
    raise exception 'site_changed' using errcode = '40001';
  end if;
  -- Taken after the lock, so it includes any publish that committed while this one waited.
  v_before := public.site_snapshot(p_tenant);
  v_diff := public.site_diff(v_before, v_after);

  -- Inserts and updates parents first (events before packages); deletes children first.
  -- shortcut: removing an event and adding one with the same slug in one draft fails on unique (tenant_id, slug)
  -- and the publish is refused; delete before insert per slug if the editor ever allows that.
  foreach v_part in array array['events', 'packages', 'offers', 'addons', 'stageThemes'] loop
    v_table := v_tables ->> v_part;
    for v_row in
      -- camelCase draft keys to snake_case columns (pricePerGuestPaisa -> price_per_guest_paisa).
      select (select jsonb_object_agg(lower(regexp_replace(e.k, '([A-Z])', '_\1', 'g')), e.v) from jsonb_each(n.r) e (k, v))
        from jsonb_array_elements(coalesce(v_diff #> array['after', v_part], '[]')) n (r)
    loop
      -- Column list from the row's own keys, so columns the draft does not carry keep their defaults.
      -- The tenant always comes from p_tenant, never from the draft.
      select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v_row - 'id' - 'tenant_id') k;
      if exists (select 1 from jsonb_array_elements(v_diff #> array['before', v_part]) o (r) where o.r ->> 'id' = v_row ->> 'id') then
        execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1))
                        where t.tenant_id = $2 and t.id = ($1 ->> ''id'')::uuid', v_table, v_cols, v_cols, v_table)
          using v_row, p_tenant;
      else
        execute format('insert into public.%I (tenant_id, id, %s) select $2, id, %s from jsonb_populate_record(null::public.%I, $1)',
                       v_table, v_cols, v_cols, v_table)
          using v_row, p_tenant;
      end if;
    end loop;
  end loop;

  foreach v_part in array array['stageThemes', 'addons', 'offers', 'packages', 'events'] loop
    select array_agg((o.r ->> 'id')::uuid) into v_gone
      from jsonb_array_elements(coalesce(v_diff #> array['before', v_part], '[]')) o (r)
      where not exists (select 1 from jsonb_array_elements(v_diff #> array['after', v_part]) n (r) where n.r ->> 'id' = o.r ->> 'id');
    continue when v_gone is null;
    execute format('delete from public.%I where tenant_id = $1 and id = any($2)', v_tables ->> v_part) using p_tenant, v_gone;
  end loop;

  if v_diff -> 'after' ?| array['identity', 'theme', 'sections', 'messaging', 'content'] then
    update public.tenant_settings set
      identity = v_after -> 'identity', theme = v_after -> 'theme', sections = v_after -> 'sections',
      messaging = v_after -> 'messaging', content = v_after -> 'content'
    where tenant_id = p_tenant;
  end if;

  -- tenants.name mirrors identity.name. Only platform admins may write tenants (RLS), so a tenant member who was
  -- granted tenant.settings.edit still cannot rename the venue.
  if v_diff #> '{after,identity}' ? 'name' then
    update public.tenants set name = v_after #>> '{identity,name}' where id = p_tenant;
    if not found then
      raise exception 'venue name needs a platform admin' using errcode = '42501';
    end if;
  end if;

  -- RLS skips rows silently (an update or delete the caller may not make touches 0 rows), and FK cascades can
  -- remove more than the draft says. The live site must now equal the draft exactly, or nothing is published.
  if public.site_diff(public.site_snapshot(p_tenant), v_after) <> '{"before": {}, "after": {}}' then
    raise exception 'publish could not apply the whole draft' using errcode = '42501';
  end if;

  perform public.record_audit(p_tenant, 'site.publish', 'site', p_tenant, v_diff -> 'before', v_diff -> 'after', null);
  return v_diff;
end $$;

revoke execute on function public.site_snapshot(uuid), public.site_diff(jsonb, jsonb), public.publish_site(uuid, int)
  from public, anon;
grant execute on function public.site_snapshot(uuid), public.site_diff(jsonb, jsonb), public.publish_site(uuid, int)
  to authenticated, service_role;
