-- Ownership: tenants.login_limit, manager_limit, currency and time_zone are the single source of truth;
-- the template's limits and money_rules.currency/timeZone are copied there and not kept in tenant_settings.
-- The template payload is validated before any insert.

create or replace function public.create_tenant_from_template(
  p_template uuid, p_account uuid, p_name text, p_slug text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_payload jsonb;
  v_tenant uuid;
  v_settings jsonb;
  v_block text;
  v_bad text;
  v_limits jsonb;
  v_money jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'create_tenant_from_template: platform admin only' using errcode = '42501';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'create_tenant_from_template: invalid slug' using errcode = '22023';
  end if;

  select payload into v_payload from public.tenant_templates where id = p_template;
  if v_payload is null then
    raise exception 'create_tenant_from_template: template not found' using errcode = 'P0002';
  end if;

  v_settings := v_payload -> 'settings';
  if jsonb_typeof(v_settings) is distinct from 'object' then
    raise exception 'create_tenant_from_template: settings must be an object' using errcode = '22023';
  end if;
  foreach v_block in array array['identity', 'theme', 'money_rules', 'messaging', 'limits'] loop
    if jsonb_typeof(v_settings -> v_block) is distinct from 'object' then
      raise exception 'create_tenant_from_template: settings.% must be an object', v_block using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(v_settings -> 'sections') is distinct from 'array' then
    raise exception 'create_tenant_from_template: settings.sections must be an array' using errcode = '22023';
  end if;

  v_limits := v_settings -> 'limits';
  foreach v_block in array array['loginLimit', 'managerLimit'] loop
    if jsonb_typeof(v_limits -> v_block) is distinct from 'number' or (v_limits ->> v_block)::numeric < 0 then
      raise exception 'create_tenant_from_template: limits.% must be a number >= 0', v_block using errcode = '22023';
    end if;
  end loop;

  v_money := v_settings -> 'money_rules';
  foreach v_block in array array['currency', 'timeZone'] loop
    if v_money ? v_block and jsonb_typeof(v_money -> v_block) is distinct from 'string' then
      raise exception 'create_tenant_from_template: money_rules.% must be a string', v_block using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(coalesce(v_payload -> 'features', '{}'::jsonb)) is distinct from 'object' then
    raise exception 'create_tenant_from_template: features must be an object' using errcode = '22023';
  end if;
  select f.key into v_bad from jsonb_each(coalesce(v_payload -> 'features', '{}'::jsonb)) f
  where jsonb_typeof(f.value) is distinct from 'boolean' limit 1;
  if v_bad is not null then
    raise exception 'create_tenant_from_template: features.% must be a boolean', v_bad using errcode = '22023';
  end if;

  insert into public.tenants (account_id, slug, name, login_limit, manager_limit, currency, time_zone)
  values (
    p_account, p_slug, p_name,
    (v_limits ->> 'loginLimit')::int, (v_limits ->> 'managerLimit')::int,
    coalesce(v_money ->> 'currency', 'PKR'), coalesce(v_money ->> 'timeZone', 'Asia/Karachi')
  )
  returning id into v_tenant;

  update public.tenant_settings set
    identity = (v_settings -> 'identity') || jsonb_build_object('name', p_name),
    theme = v_settings -> 'theme',
    sections = v_settings -> 'sections',
    money_rules = v_money - 'currency' - 'timeZone',
    messaging = v_settings -> 'messaging',
    limits = '{}'::jsonb
  where tenant_id = v_tenant;

  insert into public.tenant_features (tenant_id, feature_key, enabled)
  select v_tenant, f.key, f.value::text::boolean
  from jsonb_each(coalesce(v_payload -> 'features', '{}'::jsonb)) f;

  perform public.record_audit(
    v_tenant, 'tenant.create', 'tenant', v_tenant, null,
    jsonb_build_object('slug', p_slug, 'name', p_name, 'template', p_template), null
  );
  return v_tenant;
end $$;
