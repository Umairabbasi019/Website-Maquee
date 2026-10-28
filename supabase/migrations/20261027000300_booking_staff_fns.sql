-- M4 staff status changes. The server checks bookings.edit (and quotes.override for a changed total) and the venue,
-- then calls these through the service role. They set app.actor so the status history records who acted.
-- The transition guard in 20261027000100_booking.sql still refuses any change outside the transition table.

-- Writes quote v1 and confirms the booking in one transaction. The booking's time range is the slot on the event
-- date in the venue time zone, widened by the slot buffer at both ends; a slot whose end is not after its start ends
-- the next day. A clash with another confirmed booking in the hall raises 23P01 (no_overlap) and nothing is kept.
create function public.confirm_booking(
  p_booking uuid,
  p_hall uuid,
  p_snapshot jsonb,
  p_total int,
  p_advance int,
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
  select b.tenant_id, b.status, tstzrange(
      ((b.event_date + s.start_time) at time zone t.time_zone) - make_interval(mins => s.buffer_minutes),
      ((b.event_date + s.end_time + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end)
        at time zone t.time_zone) + make_interval(mins => s.buffer_minutes)
    )
  into v_tenant, v_status, v_during
  from public.bookings b
  join public.slots s on s.tenant_id = b.tenant_id and s.id = b.slot_id
  join public.tenants t on t.id = b.tenant_id
  where b.id = p_booking
  for update of b;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Checked before the quote insert, so a second confirm reports the transition, not the quote version clash.
  if v_status <> 'requested' then
    raise exception 'invalid_transition: % to confirmed', v_status using errcode = 'P0001';
  end if;

  insert into public.quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa, created_by)
  values (v_tenant, p_booking, 1, p_snapshot, p_total, p_advance, p_actor)
  returning id into v_quote;
  -- One statement, so the lock on confirmed bookings never sees a half-confirmed row.
  update public.bookings
  set status = 'confirmed', hall_id = p_hall, during = v_during, current_quote_id = v_quote
  where id = p_booking;
end $$;

-- Declined and cancelled differ only in the target status; the guard decides which moves are allowed.
create function public.decline_booking(p_booking uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  update public.bookings set status = 'declined', status_reason = p_reason where id = p_booking;
end $$;

create function public.cancel_booking(p_booking uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  update public.bookings set status = 'cancelled', status_reason = p_reason where id = p_booking;
end $$;

revoke all on function public.confirm_booking(uuid, uuid, jsonb, int, int, uuid) from public, anon, authenticated;
revoke all on function public.decline_booking(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid, uuid, jsonb, int, int, uuid) to service_role;
grant execute on function public.decline_booking(uuid, text, uuid) to service_role;
grant execute on function public.cancel_booking(uuid, text, uuid) to service_role;
