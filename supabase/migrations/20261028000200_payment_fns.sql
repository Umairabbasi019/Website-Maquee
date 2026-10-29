-- M5 ledger writes. The server checks payments.verify (or the provider signature) and the venue, then calls these
-- through the service role. Each takes the hall lock, then the booking row lock, so money and status move together.
-- The transition guard in 20261028000100_payments.sql still refuses any status change outside its table.

-- Locks a booking the M4 way: hall turn first, then the row. The hall is read without a lock, so a request confirmed
-- in between gains a hall we did not lock; then that hall is locked too and the row read again.
create function public.lock_booking(p_booking uuid) returns public.bookings
language plpgsql set search_path = '' as $$
declare
  v_hall uuid;
  v_row public.bookings;
begin
  select hall_id into v_hall from public.bookings where id = p_booking;
  if v_hall is not null then
    perform pg_advisory_xact_lock(hashtextextended('confirm_booking:' || v_hall::text, 0));
  end if;
  select * into v_row from public.bookings where id = p_booking for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Once set under its hall lock, the hall only changes on a request, so one re-read is enough.
  if v_row.hall_id is distinct from v_hall and v_row.hall_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('confirm_booking:' || v_row.hall_id::text, 0));
    select * into v_row from public.bookings where id = p_booking for update;
  end if;
  return v_row;
end $$;

-- Booking locks before payment locks, the same order as record_payment. A missing payment reads as a missing booking.
create function public.lock_payment(p_payment uuid) returns public.payments
language plpgsql set search_path = '' as $$
declare
  v_row public.payments;
begin
  perform public.lock_booking((select booking_id from public.payments where id = p_payment));
  select * into v_row from public.payments where id = p_payment for update;
  return v_row;
end $$;

-- Verified payments minus verified refunds. Pending and rejected rows never count.
create function public.booking_paid(p_booking uuid) returns int
language sql stable set search_path = '' as $$
  select coalesce(sum(case kind when 'payment' then amount_paisa else -amount_paisa end), 0)::int
  from public.payments where booking_id = p_booking and status = 'verified';
$$;

-- Moves a held or expired booking once verified money changes. Called with the hall and booking locks held.
create function public.settle_booking(p_booking uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_status text;
  v_hall uuid;
  v_during tstzrange;
  v_met boolean;
begin
  select b.status, b.hall_id, b.during, public.booking_paid(b.id) >= q.advance_paisa
  into v_status, v_hall, v_during, v_met
  from public.bookings b join public.quotes q on q.id = b.current_quote_id
  where b.id = p_booking;
  if v_status = 'awaiting_advance' and v_met then
    update public.bookings set status = 'confirmed' where id = p_booking;
  elsif v_status = 'hold_expired' and v_met then
    -- The range is kept on the row, so no_overlap decides whether the slot is still free.
    begin
      update public.bookings set status = 'confirmed' where id = p_booking;
    exception when exclusion_violation then
      update public.bookings set status = 'refund_pending' where id = p_booking;
    end;
  elsif v_status = 'hold_expired' and exists (
    select 1 from public.bookings o
    where o.hall_id = v_hall and o.during && v_during and o.status in ('confirmed', 'awaiting_advance') and o.id <> p_booking
  ) then
    update public.bookings set status = 'refund_pending' where id = p_booking;
  end if;
end $$;

-- One ledger row. Staff rows are verified at once and settle the booking; receipts and online payments wait pending.
create function public.record_payment(
  p_booking uuid,
  p_kind text,
  p_method text,
  p_amount int,
  p_source text,
  p_note text,
  p_receipt_path text,
  p_provider text,
  p_provider_ref text,
  p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_paid int;
  v_limit int;
  v_pending int;
  v_recent int;
  v_staff boolean := p_source = 'staff';
  v_id uuid;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  -- A staff row is verified at once, so it must say who verified it.
  if v_staff and p_actor is null then
    raise exception using errcode = 'P0001', message = 'invalid_actor';
  end if;
  v_booking := public.lock_booking(p_booking);
  -- Money comes in only while the booking can still use it. A refund can follow any money paid, including late money
  -- from a webhook that finished after the last refund.
  if not (v_booking.status in ('confirmed', 'awaiting_advance', 'hold_expired')
    or (p_kind = 'refund' and v_booking.status in ('refund_pending', 'cancelled', 'refunded'))) then
    raise exception using errcode = 'P0001', message = 'payment_state';
  end if;
  v_paid := public.booking_paid(p_booking);
  v_limit := case when p_kind = 'refund' then v_paid
    else (select total_paisa from public.quotes where id = v_booking.current_quote_id) - v_paid end;
  if not coalesce(p_amount between 1 and v_limit, false) then
    raise exception using errcode = 'P0001', message = 'amount_out_of_range';
  end if;
  if p_source = 'customer_receipt' then
    select count(*) filter (where status = 'pending'), count(*) filter (where created_at > now() - interval '1 hour')
    into v_pending, v_recent
    from public.payments where booking_id = p_booking and source = 'customer_receipt';
    if v_pending >= 3 or v_recent >= 10 then
      raise exception using errcode = 'P0001', message = 'receipt_limit';
    end if;
  end if;

  insert into public.payments (tenant_id, booking_id, kind, method, amount_paisa, status, source, note, receipt_path,
    provider, provider_ref, recorded_by, verified_by, verified_at)
  values (v_booking.tenant_id, p_booking, p_kind, p_method, p_amount, case when v_staff then 'verified' else 'pending' end,
    p_source, p_note, p_receipt_path, p_provider, p_provider_ref, p_actor,
    case when v_staff then p_actor end, case when v_staff then now() end)
  returning id into v_id;

  if v_staff then
    perform public.settle_booking(p_booking);
    -- Money fully returned: a late payment's booking is done, and a cancelled one no longer owes a refund.
    if p_kind = 'refund' and public.booking_paid(p_booking) = 0 then
      update public.bookings set status = 'refunded' where id = p_booking and status = 'refund_pending';
      update public.bookings set refund_due = false where id = p_booking and refund_due;
    end if;
  end if;
  return v_id;
end $$;

-- Staff accept a receipt, at the amount that actually arrived, which is what the settle check then uses.
create function public.verify_payment(p_payment uuid, p_amount int, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_total int;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  v_payment := public.lock_payment(p_payment);
  if v_payment.status <> 'pending' or v_payment.source <> 'customer_receipt' then
    raise exception using errcode = 'P0001', message = 'payment_state';
  end if;
  select q.total_paisa into v_total
  from public.bookings b join public.quotes q on q.id = b.current_quote_id where b.id = v_payment.booking_id;
  if not coalesce(p_amount between 1 and v_total - public.booking_paid(v_payment.booking_id), false) then
    raise exception using errcode = 'P0001', message = 'amount_out_of_range';
  end if;
  update public.payments set status = 'verified', amount_paisa = p_amount, verified_by = p_actor, verified_at = now()
  where id = p_payment;
  perform public.settle_booking(v_payment.booking_id);
end $$;

create function public.reject_payment(p_payment uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  if not coalesce(char_length(p_reason) between 3 and 300, false) then
    raise exception using errcode = 'P0001', message = 'invalid_reason';
  end if;
  v_payment := public.lock_payment(p_payment);
  -- Only the provider decides an online payment; a staff reject could hide money the provider later takes.
  if v_payment.status <> 'pending' or v_payment.source = 'provider' then
    raise exception using errcode = 'P0001', message = 'payment_state';
  end if;
  update public.payments set status = 'rejected', reject_reason = p_reason where id = p_payment;
end $$;

-- Terms only mean something once the booking is confirmed; the guard locks them on every other status.
create function public.set_payment_terms(p_booking uuid, p_advance_due_on date, p_pay_later boolean, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  if (public.lock_booking(p_booking)).status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'payment_state';
  end if;
  update public.bookings set advance_due_on = p_advance_due_on, pay_later = p_pay_later where id = p_booking;
end $$;

-- A provider webhook after its signature passed. The event row goes in first, so a replay (even a concurrent one,
-- which waits on the unique key) is a duplicate, and unknown or mismatched events are kept for audit.
-- A paid event wins over an earlier failed one: the money was taken, so it must reach the ledger.
create function public.apply_provider_event(
  p_provider text,
  p_event_id text,
  p_provider_ref text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_payment public.payments;
  v_result text;
begin
  perform set_config('app.actor', '', true);
  if p_status is null or p_status not in ('paid', 'failed') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;
  -- result is a placeholder until the end of this function sets the real one.
  insert into public.provider_events (provider, event_id, payload, result)
  values (p_provider, p_event_id, p_payload, 'unknown')
  on conflict (provider, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  select * into v_payment from public.payments where provider = p_provider and provider_ref = p_provider_ref;
  if v_payment.id is null then
    v_result := 'unknown';
  else
    v_payment := public.lock_payment(v_payment.id);
    if p_amount is distinct from v_payment.amount_paisa
      or p_currency is distinct from (select currency from public.tenants where id = v_payment.tenant_id) then
      v_result := 'mismatch';
    elsif p_status = 'paid' and v_payment.status <> 'verified' then
      update public.payments set status = 'verified', reject_reason = null, verified_by = null, verified_at = now()
      where id = v_payment.id;
      perform public.settle_booking(v_payment.booking_id);
      v_result := 'applied';
    elsif p_status = 'failed' and v_payment.status = 'pending' then
      update public.payments set status = 'rejected', reject_reason = 'Payment failed' where id = v_payment.id;
      v_result := 'applied';
    else
      -- An earlier event already decided this payment.
      v_result := 'duplicate';
    end if;
  end if;

  update public.provider_events set result = v_result, payment_id = v_payment.id where id = v_event;
  return v_result;
end $$;

revoke all on function public.lock_booking(uuid) from public, anon, authenticated, service_role;
revoke all on function public.lock_payment(uuid) from public, anon, authenticated, service_role;
revoke all on function public.booking_paid(uuid) from public, anon, authenticated, service_role;
revoke all on function public.settle_booking(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_payment(uuid, text, text, int, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.verify_payment(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.reject_payment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.set_payment_terms(uuid, date, boolean, uuid) from public, anon, authenticated;
revoke all on function public.apply_provider_event(text, text, text, text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, text, text, int, text, text, text, text, text, uuid) to service_role;
grant execute on function public.verify_payment(uuid, int, uuid) to service_role;
grant execute on function public.reject_payment(uuid, text, uuid) to service_role;
grant execute on function public.set_payment_terms(uuid, date, boolean, uuid) to service_role;
grant execute on function public.apply_provider_event(text, text, text, text, int, text, jsonb) to service_role;
