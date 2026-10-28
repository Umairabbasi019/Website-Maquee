-- M5 holds: quick booking, lazy hold expiry, the advance due date on confirm and the refund choice on cancel.
-- Same pattern as M4: the server checks the venue and permissions, then calls these through the service role.
-- Replaces the M4 confirm_booking and cancel_booking (20261027000300_booking_staff_fns.sql) with new signatures.

-- The booking's time range: the slot on the event date in the venue time zone, widened by the slot buffer at both
-- ends; a slot whose end is not after its start ends the next day.
create function public.booking_during(p_booking uuid) returns tstzrange
language sql stable set search_path = '' as $$
  select tstzrange(
    ((b.event_date + s.start_time) at time zone t.time_zone) - make_interval(mins => s.buffer_minutes),
    ((b.event_date + s.end_time + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end)
      at time zone t.time_zone) + make_interval(mins => s.buffer_minutes)
  )
  from public.bookings b
  join public.slots s on s.tenant_id = b.tenant_id and s.id = b.slot_id
  join public.tenants t on t.id = b.tenant_id
  where b.id = p_booking;
$$;

-- No job runner yet: a hold past its time only frees the range when another write needs it. Called with the hall lock held.
-- shortcut: holds expire only on a clash here, so the stored status lags; the M7 job runner expires them on time.
create function public.expire_holds(p_hall uuid, p_during tstzrange) returns void
language sql set search_path = '' as $$
  update public.bookings set status = 'hold_expired'
  where hall_id = p_hall and during && p_during and status = 'awaiting_advance' and hold_expires_at < now();
$$;

drop function public.confirm_booking(uuid, uuid, jsonb, int, int, uuid);
drop function public.cancel_booking(uuid, text, uuid);

-- Writes quote v1 and confirms the booking in one transaction, after expiring old holds on its range.
-- A clash with another confirmed booking or live hold in the hall raises 23P01 (no_overlap) and nothing is kept.
create function public.confirm_booking(
  p_booking uuid,
  p_hall uuid,
  p_snapshot jsonb,
  p_total int,
  p_advance int,
  p_advance_due_on date,
  p_actor uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_status text;
  v_during tstzrange;
  v_quote uuid;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  -- Two clashing confirms that check the exclusion constraint at once wait on each other and one dies as a deadlock
  -- (40P01). Taking turns per hall makes the second see the first's committed row and fail cleanly with 23P01.
  perform pg_advisory_xact_lock(hashtextextended('confirm_booking:' || p_hall::text, 0));
  select tenant_id, status into v_tenant, v_status from public.bookings where id = p_booking for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Checked before the quote insert, so a second confirm reports the transition, not the quote version clash.
  if v_status <> 'requested' then
    raise exception 'invalid_transition: % to confirmed', v_status using errcode = 'P0001';
  end if;
  v_during := public.booking_during(p_booking);
  perform public.expire_holds(p_hall, v_during);

  insert into public.quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa, created_by)
  values (v_tenant, p_booking, 1, p_snapshot, p_total, p_advance, p_actor)
  returning id into v_quote;
  -- One statement, so the lock on confirmed bookings never sees a half-confirmed row.
  update public.bookings
  set status = 'confirmed', hall_id = p_hall, during = v_during, current_quote_id = v_quote, advance_due_on = p_advance_due_on
  where id = p_booking;
end $$;

-- A public request that holds the first free hall of p_candidates ([{hall, snapshot, total, advance}], in the order to
-- try) until p_hold_until. The server priced each hall and checked it is the venue's own. With no hall free, the
-- booking stays a plain request. Returns {reference, held}.
create function public.create_quick_booking(
  p_tenant uuid,
  p_customer jsonb,
  p_booking jsonb,
  p_token_hash text,
  p_expires timestamptz,
  p_key_hashes text[],
  p_candidates jsonb,
  p_hold_until timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reference text;
  v_booking uuid;
  v_during tstzrange;
  v_hall uuid;
  v_quote uuid;
  c jsonb;
begin
  -- The customer made it: the status history actor is null.
  perform set_config('app.actor', '', true);
  v_reference := public.create_booking_request(p_tenant, p_customer, p_booking, p_token_hash, p_expires, p_key_hashes);
  select id into v_booking from public.bookings where tenant_id = p_tenant and reference = v_reference;
  v_during := public.booking_during(v_booking);
  for c in select value from jsonb_array_elements(p_candidates) loop
    v_hall := (c ->> 'hall')::uuid;
    -- Each hall in its own savepoint: a clash undoes that hall's quote and expiries, and the next hall is tried.
    begin
      perform pg_advisory_xact_lock(hashtextextended('confirm_booking:' || v_hall::text, 0));
      perform public.expire_holds(v_hall, v_during);
      insert into public.quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa)
      values (p_tenant, v_booking, 1, c -> 'snapshot', (c ->> 'total')::int, (c ->> 'advance')::int)
      returning id into v_quote;
      update public.bookings
      set status = 'awaiting_advance', hall_id = v_hall, during = v_during, current_quote_id = v_quote, hold_expires_at = p_hold_until
      where id = v_booking;
      return jsonb_build_object('reference', v_reference, 'held', true);
    exception when exclusion_violation then
      null;
    end;
  end loop;
  return jsonb_build_object('reference', v_reference, 'held', false);
end $$;

-- With money paid the manager must choose: keep it (p_refund_due false) or owe it back (true). With nothing paid the
-- choice is ignored, as in M4.
create function public.cancel_booking(p_booking uuid, p_reason text, p_refund_due boolean, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_paid int;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  v_status := (public.lock_booking(p_booking)).status;
  -- Checked here so a booking that cannot be cancelled reports the transition, not the missing choice.
  if v_status not in ('requested', 'confirmed', 'awaiting_advance') then
    raise exception 'invalid_transition: % to cancelled', v_status using errcode = 'P0001';
  end if;
  v_paid := public.booking_paid(p_booking);
  if v_paid > 0 and p_refund_due is null then
    raise exception using errcode = 'P0001', message = 'refund_choice_required';
  end if;
  update public.bookings
  set status = 'cancelled', status_reason = p_reason, refund_due = v_paid > 0 and p_refund_due
  where id = p_booking;
end $$;

revoke all on function public.booking_during(uuid) from public, anon, authenticated, service_role;
revoke all on function public.expire_holds(uuid, tstzrange) from public, anon, authenticated, service_role;
revoke all on function public.confirm_booking(uuid, uuid, jsonb, int, int, date, uuid) from public, anon, authenticated;
revoke all on function public.create_quick_booking(uuid, jsonb, jsonb, text, timestamptz, text[], jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid, uuid, jsonb, int, int, date, uuid) to service_role;
grant execute on function public.create_quick_booking(uuid, jsonb, jsonb, text, timestamptz, text[], jsonb, timestamptz) to service_role;
grant execute on function public.cancel_booking(uuid, text, boolean, uuid) to service_role;
