-- Demo data for local development. Runs on every `supabase db reset`, before any auth user exists;
-- scripts/seed-users.ts adds users, memberships and the platform admin afterwards.
-- theme.colors.primary carries each tenant's accent colour (the theme schema has no separate accent key).

insert into tenant_templates (name, payload) values ('Standard marquee', $json$
{
  "settings": {
    "identity": { "name": "", "phones": [], "openingHours": [], "social": {} },
    "theme": {
      "colors": { "primary": "#c2a878", "background": "#ece7df", "text": "#2b2a28", "muted": "#8a857d", "deep": "#9c7a3c" },
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

do $$
declare
  v_template jsonb := (select payload from tenant_templates where name = 'Standard marquee');
  v_account uuid;
  v_tenant uuid;
  v_theme jsonb;
  v_def record;
begin
  for v_def in
    select * from (values
      ('Manor Group', 'manor', 'Manor', 'live', 'manor.localhost',
       '{"colors":{"primary":"#d9bf8c","background":"#0b0405","text":"#f4ece0","muted":"#b3a597","deep":"#5b0f1a"},"fonts":{"heading":"Cormorant Garamond","body":"Inter"}}'::jsonb),
      ('Demo Events', 'demo-hall', 'Demo Hall', 'setup', 'demo.localhost', null::jsonb)
    ) as t(account_name, slug, tenant_name, status, host, theme)
  loop
    insert into accounts (name) values (v_def.account_name) returning id into v_account;
    insert into tenants (account_id, slug, name, status)
    values (v_account, v_def.slug, v_def.tenant_name, v_def.status) returning id into v_tenant;

    v_theme := coalesce(v_def.theme, v_template -> 'settings' -> 'theme');
    update tenant_settings set
      identity = (v_template -> 'settings' -> 'identity') || jsonb_build_object('name', v_def.tenant_name),
      theme = v_theme,
      sections = v_template -> 'settings' -> 'sections',
      money_rules = (v_template -> 'settings' -> 'money_rules') - 'currency' - 'timeZone',
      messaging = v_template -> 'settings' -> 'messaging'
    where tenant_id = v_tenant;

    insert into tenant_features (tenant_id, feature_key, enabled)
    select v_tenant, f.key, f.value::text::boolean from jsonb_each(v_template -> 'features') f;

    insert into tenant_domains (tenant_id, host, verified_at, is_primary) values (v_tenant, v_def.host, now(), true);
    insert into halls (tenant_id, name, capacity_min, capacity_max) values (v_tenant, 'Main hall', 100, 500);
    insert into slots (tenant_id, name, start_time, end_time) values
      (v_tenant, 'Lunch', '12:00', '16:00'),
      (v_tenant, 'Dinner', '19:00', '23:00');
  end loop;
end $$;
