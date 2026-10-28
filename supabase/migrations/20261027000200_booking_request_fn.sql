-- M4 public booking request, in one transaction: rate limit, customer, reference, booking, private link token.
-- Called only by the server (service role) after it has checked every id against the venue's own active rows.
-- It never reads bookings, so a taken date and a free one take the same path and give the same answer.
-- No app.actor is set, so the status history row has actor null: the customer made the request.
create function public.create_booking_request(
  p_tenant uuid,
  p_customer jsonb,
  p_booking jsonb,
  p_token_hash text,
  p_expires timestamptz,
  p_key_hashes text[]
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text;
  v_yymm text;
  v_n int;
  v_customer uuid;
  v_booking uuid;
  v_reference text;
begin
  -- Serialise requests per key (and for the venue as a whole), so two at once cannot both take the last place.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || k, 0)) from unnest(p_key_hashes || 'venue'::text) as k order by k;
  if exists (
    select 1 from public.booking_request_hits
    where tenant_id = p_tenant and key_hash = any (p_key_hashes) and at > now() - interval '1 hour'
    group by key_hash having count(*) >= 5
  ) or (
    -- Per-venue cap: 30 requests an hour across all phones and IPs, so random keys cannot flood a venue.
    select count(*) from public.booking_request_hits
    where tenant_id = p_tenant and key_hash = 'venue' and at > now() - interval '1 hour'
  ) >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.booking_request_hits (tenant_id, key_hash) select p_tenant, k from unnest(p_key_hashes || 'venue'::text) as k;

  -- A returning phone keeps its first name (a stranger cannot rename it); consent is only ever added here.
  insert into public.customers as c (tenant_id, name, phone_e164, whatsapp_consent_at)
  values (
    p_tenant, p_customer ->> 'name', p_customer ->> 'phone_e164',
    case when (p_customer ->> 'whatsapp_consent')::boolean then now() end
  )
  on conflict (tenant_id, phone_e164) do update
    set whatsapp_consent_at = coalesce(c.whatsapp_consent_at, excluded.whatsapp_consent_at)
  returning id into v_customer;

  select slug, to_char(now() at time zone time_zone, 'YYMM') into v_slug, v_yymm from public.tenants where id = p_tenant;
  insert into public.booking_ref_counters as r (tenant_id, yymm, n) values (p_tenant, v_yymm, 1)
  on conflict (tenant_id, yymm) do update set n = r.n + 1
  returning n into v_n;
  -- At least four digits: lpad would cut a fifth one, so the number widens past 9999.
  -- The first two letters of the slug; slugs may hold digits and hyphens.
  v_reference := upper(rpad(left(regexp_replace(v_slug, '[^a-z]', '', 'g'), 2), 2, 'x')) || '-' || v_yymm || '-' || case when v_n < 10000 then lpad(v_n::text, 4, '0') else v_n::text end;

  insert into public.bookings (
    tenant_id, reference, customer_id, event_date, slot_id, event_type_id, event_type_name,
    package_id, package_name, addon_ids, addon_names, guests
  ) values (
    p_tenant, v_reference, v_customer, (p_booking ->> 'event_date')::date, (p_booking ->> 'slot_id')::uuid,
    (p_booking ->> 'event_type_id')::uuid, p_booking ->> 'event_type_name',
    (p_booking ->> 'package_id')::uuid, p_booking ->> 'package_name',
    array(select e from jsonb_array_elements_text(p_booking -> 'addon_ids') with ordinality as a (e, i) order by i)::uuid[],
    array(select e from jsonb_array_elements_text(p_booking -> 'addon_names') with ordinality as a (e, i) order by i), (p_booking ->> 'guests')::int
  ) returning id into v_booking;

  insert into public.access_tokens (tenant_id, kind, target_id, token_hash, expires_at)
  values (p_tenant, 'booking', v_booking, p_token_hash, p_expires);
  return v_reference;
end $$;

revoke all on function public.create_booking_request(uuid, jsonb, jsonb, text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.create_booking_request(uuid, jsonb, jsonb, text, timestamptz, text[]) to service_role;
