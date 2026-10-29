-- M5 dashboard payment alerts, computed in one query so no API row cap can cut a long-lived venue's lists.
-- Returns booking ids per alert. paid = verified payments - verified refunds (0 at the least), against the current quote.
-- "Today" is the venue's date in tenants.time_zone. The server checks payments.verify (and the owner rule for
-- rejectedAfterEvent) before calling this through the service role.
create function public.payment_alerts(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with venue as (
    select (now() at time zone time_zone)::date as today from public.tenants where id = p_tenant
  ), paid as (
    select booking_id, greatest(0, sum(case kind when 'payment' then amount_paisa else -amount_paisa end)) as paid
    from public.payments where tenant_id = p_tenant and status = 'verified' group by booking_id
  ), b as (
    select bk.id, bk.status, bk.advance_due_on, bk.pay_later, bk.refund_due, q.total_paisa, q.advance_paisa, coalesce(p.paid, 0) as paid
    from public.bookings bk
    left join public.quotes q on q.id = bk.current_quote_id
    left join paid p on p.booking_id = bk.id
    where bk.tenant_id = p_tenant
      and bk.status in ('awaiting_advance', 'confirmed', 'hold_expired', 'refund_pending', 'cancelled')
  ), late as (
    -- Late money: verified after the booking moved into cancelled or refunded (a webhook or receipt that finished after
    -- the cancel), net of refunds since. Money kept at the cancel was verified before it, so it stays quiet.
    select p.booking_id
    from public.payments p
    join public.bookings bk on bk.id = p.booking_id
    where p.tenant_id = p_tenant and p.status = 'verified' and bk.status in ('cancelled', 'refunded')
      and p.verified_at > (select max(h.at) from public.booking_status_history h
        where h.tenant_id = p_tenant and h.booking_id = bk.id and h.to_status = bk.status)
    group by p.booking_id
    having sum(case p.kind when 'payment' then p.amount_paisa else -p.amount_paisa end) > 0
  )
  select jsonb_build_object(
    'receiptsToReview', coalesce((select jsonb_agg(distinct booking_id) from public.payments
      where tenant_id = p_tenant and status = 'pending' and source = 'customer_receipt'), '[]'),
    'onlineStuck', coalesce((select jsonb_agg(distinct booking_id) from public.payments
      where tenant_id = p_tenant and status = 'pending' and source = 'provider' and created_at < now() - interval '1 hour'), '[]'),
    'advanceOverdue', coalesce((select jsonb_agg(b.id) from b, venue
      where b.status = 'confirmed' and not b.pay_later and b.total_paisa is not null and b.advance_due_on < venue.today
        and b.paid < b.advance_paisa and b.total_paisa - b.paid > 0), '[]'),
    'refundDue', coalesce((select jsonb_agg(id) from (
      select b.id from b
      where b.status = 'refund_pending'
        or (b.status = 'cancelled' and b.refund_due and b.paid > 0)
        or b.paid > b.total_paisa
      union select booking_id from late) r), '[]'),
    'rejectedAfterEvent', coalesce((select jsonb_agg(distinct p.booking_id) from public.payments p
      join public.bookings bk on bk.id = p.booking_id, venue
      where p.tenant_id = p_tenant and p.status = 'rejected' and p.created_at > now() - interval '30 days'
        and bk.event_date < venue.today), '[]')
  );
$$;

revoke all on function public.payment_alerts(uuid) from public, anon, authenticated;
grant execute on function public.payment_alerts(uuid) to service_role;
