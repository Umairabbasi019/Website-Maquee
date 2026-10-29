-- M5 payments: the payment ledger, provider event log, private receipts bucket, and the booking statuses and columns
-- they need. Only the server (service role) writes; staff with payments.view read their own venue.
-- Statuses (M5): requested -> awaiting_advance -> confirmed | hold_expired | cancelled, hold_expired -> confirmed |
-- refund_pending, refund_pending -> refunded. The M4 moves stay. The database refuses the rest.

alter table bookings drop constraint bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('requested', 'awaiting_advance', 'confirmed', 'hold_expired', 'refund_pending', 'refunded', 'declined', 'cancelled'));

alter table bookings
  add column hold_expires_at timestamptz,
  add column advance_due_on date,
  add column pay_later boolean not null default false,
  add column refund_due boolean not null default false;

alter table bookings add constraint bookings_held_complete
  check (status <> 'awaiting_advance'
    or (hall_id is not null and during is not null and current_quote_id is not null and hold_expires_at is not null));
alter table bookings add constraint bookings_refund_due_cancelled check (not refund_due or status = 'cancelled');

-- A hold blocks the hall like a confirmed booking; an expired hold does not.
alter table bookings drop constraint no_overlap;
alter table bookings add constraint no_overlap
  exclude using gist (hall_id with =, during with &&) where (status in ('confirmed', 'awaiting_advance'));

-- Same lock as M4, now per status. Fields a status leaves free are listed in v_free; anything else is locked.
-- refund_due on a cancelled booking may only be cleared (a manager clears it by refunding).
create or replace function public.check_booking_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_free text[] := array['event_type_id', 'package_id'];
begin
  if new.status is distinct from old.status and not (
    (old.status = 'requested' and new.status in ('awaiting_advance', 'confirmed', 'declined', 'cancelled'))
    or (old.status = 'awaiting_advance' and new.status in ('confirmed', 'hold_expired', 'cancelled'))
    or (old.status = 'hold_expired' and new.status in ('confirmed', 'refund_pending'))
    or (old.status = 'refund_pending' and new.status = 'refunded')
    or (old.status = 'confirmed' and new.status = 'cancelled')
  ) then
    raise exception 'invalid_transition: % to %', old.status, new.status using errcode = 'P0001';
  end if;
  v_free := v_free || case old.status
    when 'confirmed' then array['status', 'status_reason', 'advance_due_on', 'pay_later', 'refund_due']
    when 'awaiting_advance' then array['status', 'status_reason', 'refund_due']
    when 'hold_expired' then array['status', 'status_reason']
    when 'refund_pending' then array['status']
    when 'cancelled' then array['refund_due']
    else array[]::text[]
  end;
  if old.status <> 'requested' and (
    (new.event_type_id is distinct from old.event_type_id and new.event_type_id is not null)
    or (new.package_id is distinct from old.package_id and new.package_id is not null)
    or (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free)
    or (old.status = 'cancelled' and new.refund_due and not old.refund_due)
  ) then
    raise exception 'booking_locked: a % booking cannot change its details', old.status using errcode = 'P0001';
  end if;
  return new;
end $$;

-- The ledger: payments and refunds, one row each. paid = verified payments - verified refunds, derived on read.
create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid not null,
  kind text not null check (kind in ('payment', 'refund')),
  method text not null check (method in ('bank', 'jazzcash', 'easypaisa', 'cash', 'online')),
  amount_paisa int not null constraint payments_amount_positive check (amount_paisa > 0),
  status text not null check (status in ('pending', 'verified', 'rejected')),
  source text not null check (source in ('customer_receipt', 'staff', 'provider')),
  note text,
  reject_reason text,
  receipt_path text,
  provider text,
  provider_ref text,
  recorded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payments_reject_reason check ((status = 'rejected') = (reject_reason is not null)),
  constraint payments_provider check ((source = 'provider') = (method = 'online') and (method = 'online') = (provider is not null)),
  constraint payments_refund_staff check (kind <> 'refund' or source = 'staff'),
  foreign key (tenant_id, booking_id) references bookings (tenant_id, id) on delete cascade
);
create index payments_booking_idx on payments (tenant_id, booking_id);
create unique index payments_provider_ref_key on payments (provider, provider_ref) where provider is not null;

-- Every provider webhook delivery, for replay protection and audit. payment_id is null when no payment matched.
create table provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payment_id uuid references payments (id) on delete set null,
  payload jsonb not null,
  result text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

alter table payments enable row level security;
alter table provider_events enable row level security;

create policy payments_read on payments for select to authenticated
  using (public.auth_has_perm(tenant_id, 'payments.view'));

revoke all on provider_events from anon, authenticated;
-- Clients only read payments (RLS above); every write goes through the service-role functions.
revoke insert, update, delete, truncate on payments from anon, authenticated;

-- No storage policies: the bucket is private, and the server reads and writes it with the service role only.
insert into storage.buckets (id, name, public) values ('payment-receipts', 'payment-receipts', false);
