-- Platform-admin-only tenant creation from a template. The settings row already exists
-- (tenants_create_settings trigger), so it is updated from the template payload.
-- Payload shape: { "settings": { identity, theme, sections, money_rules, messaging, limits }, "features": { key: bool } }

create function public.create_tenant_from_template(
  p_template uuid, p_account uuid, p_name text, p_slug text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_payload jsonb;
  v_tenant uuid;
  v_settings jsonb;
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

  insert into public.tenants (account_id, slug, name) values (p_account, p_slug, p_name)
  returning id into v_tenant;

  v_settings := coalesce(v_payload -> 'settings', '{}'::jsonb);
  update public.tenant_settings set
    identity = coalesce(v_settings -> 'identity', '{}'::jsonb) || jsonb_build_object('name', p_name),
    theme = coalesce(v_settings -> 'theme', '{}'::jsonb),
    sections = coalesce(v_settings -> 'sections', '{}'::jsonb),
    money_rules = coalesce(v_settings -> 'money_rules', '{}'::jsonb),
    messaging = coalesce(v_settings -> 'messaging', '{}'::jsonb),
    limits = coalesce(v_settings -> 'limits', '{}'::jsonb)
  where tenant_id = v_tenant;

  insert into public.tenant_features (tenant_id, feature_key, enabled)
  select v_tenant, f.key, f.value::boolean
  from jsonb_each_text(coalesce(v_payload -> 'features', '{}'::jsonb)) f;

  perform public.record_audit(
    v_tenant, 'tenant.create', 'tenant', v_tenant, null,
    jsonb_build_object('slug', p_slug, 'name', p_name, 'template', p_template), null
  );
  return v_tenant;
end $$;

revoke execute on function public.create_tenant_from_template(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_tenant_from_template(uuid, uuid, text, text) to authenticated, service_role;

-- Default template: sample content, to be replaced with the venue's real data.
insert into public.tenant_templates (name, payload) values ('Default marquee venue', $json$
{
  "settings": {
    "identity": { "name": "", "phones": [], "openingHours": [], "social": {} },
    "theme": {
      "colors": { "primary": "#b8893b", "background": "#0b0b0f", "text": "#f5efe6" },
      "fonts": { "heading": "Cormorant Garamond", "body": "Inter" }
    },
    "sections": [
      { "key": "hero", "visible": true }, { "key": "inside", "visible": true },
      { "key": "stage", "visible": true }, { "key": "gallery", "visible": true },
      { "key": "events", "visible": true }, { "key": "packages", "visible": true },
      { "key": "contact", "visible": true }, { "key": "footer", "visible": true }
    ],
    "money_rules": {
      "currency": "PKR", "timeZone": "Asia/Karachi", "taxPercent": 0, "advancePercent": 50,
      "holdHours": 48, "instantBooking": false, "paymentMethods": ["bank", "jazzcash", "easypaisa"]
    },
    "messaging": { "reminderDays": [7, 3, 1], "morningSummaryTime": "08:00", "marketingCapPerMonth": 4 },
    "limits": { "loginLimit": 5, "managerLimit": 2 }
  },
  "features": { "stage_preview": true, "invites": false, "marketing": false, "run_sheet": true }
}
$json$);
