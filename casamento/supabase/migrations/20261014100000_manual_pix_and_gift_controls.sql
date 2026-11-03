alter table public.gifts
  add column if not exists manual_availability_override boolean not null default false,
  add column if not exists manual_availability_updated_at timestamptz,
  add column if not exists manual_availability_updated_by uuid references public.profiles (id);

alter table public.gift_payments
  add column if not exists payment_method text not null default 'card',
  add column if not exists confirmation_requested_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles (id),
  add column if not exists rejected_by uuid references public.profiles (id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reservation_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gift_payments_payment_method_check'
      and conrelid = 'public.gift_payments'::regclass
  ) then
    alter table public.gift_payments
      add constraint gift_payments_payment_method_check
      check (payment_method in ('card', 'pix'));
  end if;

end;
$$;

insert into public.wedding_settings (key, value, is_public)
values
  ('pix_key', to_jsonb(''::text), false),
  ('pix_recipient_name', to_jsonb('Hayato Miyata Rocha'::text), false)
on conflict (key) do nothing;

update public.wedding_settings
set is_public = false
where key in ('pix_key', 'pix_recipient_name');

create table if not exists public.gift_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.gift_payments (id) on delete set null,
  gift_id uuid not null references public.gifts (id) on delete restrict,
  actor_id uuid references public.profiles (id),
  event_type text not null,
  previous_status text,
  next_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gift_payment_events_gift_created_idx
  on public.gift_payment_events (gift_id, created_at desc);

create index if not exists gift_payment_events_payment_created_idx
  on public.gift_payment_events (payment_id, created_at desc);

alter table public.gift_payment_events enable row level security;
revoke all on public.gift_payment_events from public, anon, authenticated;
grant select on public.gift_payment_events to authenticated;

drop policy if exists gift_payment_events_admin_read on public.gift_payment_events;
create policy gift_payment_events_admin_read
  on public.gift_payment_events for select to authenticated
  using ((select public.is_wedding_admin()));

grant select (
  reservation_payment_key, reservation_expires_at, reservation_in_process,
  gifted_payment_key, gifted_at, manual_availability_override,
  manual_availability_updated_at, manual_availability_updated_by
)
on public.gifts to service_role;

grant select (
  id, name, description, value, category, image_url, file_url, file_type,
  available, public_visible, created_at, reservation_expires_at,
  reservation_in_process, gifted_at, manual_availability_override
)
on public.gifts to anon;

create or replace function public.reserve_gift_payment(
  p_gift_id uuid,
  p_idempotency_key uuid,
  p_guest_name text,
  p_message text,
  p_reservation_expires_at timestamptz,
  p_payment_method text
)
returns setof public.gift_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  gift_row public.gifts%rowtype;
  payment_row public.gift_payments%rowtype;
  payment_exists boolean;
  prior_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;

  if p_gift_id is null
    or p_idempotency_key is null
    or p_reservation_expires_at is null
    or p_payment_method is null
    or p_guest_name is null
    or char_length(trim(p_guest_name)) not between 1 and 120
    or (p_message is not null and char_length(p_message) > 300)
    or p_reservation_expires_at <= now()
    or p_reservation_expires_at > now() + interval '25 hours'
    or p_payment_method not in ('card', 'pix') then
    raise exception using errcode = '22023', message = 'Invalid gift reservation input';
  end if;

  select * into gift_row
  from public.gifts
  where id = p_gift_id
  for update;

  if not found then
    return;
  end if;

  select * into payment_row
  from public.gift_payments
  where idempotency_key = p_idempotency_key
  for update;
  payment_exists := found;

  if payment_exists then
    if payment_row.gift_id <> p_gift_id
      or payment_row.guest_name <> trim(p_guest_name)
      or payment_row.message is distinct from nullif(trim(p_message), '')
      or payment_row.payment_method <> p_payment_method then
      raise exception using errcode = '23505', message = 'Idempotency key does not match checkout';
    end if;

    if payment_row.payment_status not in ('pending', 'in_process')
      or gift_row.reservation_payment_key is distinct from p_idempotency_key
      or gift_row.reservation_expires_at is null
      or gift_row.reservation_expires_at <= now() then
      return;
    end if;

    return next payment_row;
    return;
  end if;

  if not gift_row.available
    or not gift_row.public_visible
    or (gift_row.gifted_at is not null and not gift_row.manual_availability_override) then
    return;
  end if;

  if gift_row.reservation_payment_key is not null then
    select * into payment_row
    from public.gift_payments
    where idempotency_key = gift_row.reservation_payment_key
    for update;

    if found and payment_row.payment_status = 'approved' then
      return;
    end if;

    if gift_row.reservation_expires_at is not null
      and gift_row.reservation_expires_at > now() then
      return;
    end if;

    prior_status := payment_row.payment_status;
    update public.gift_payments
    set payment_status = 'expired',
        reservation_expires_at = coalesce(reservation_expires_at, now()),
        updated_at = now()
    where idempotency_key = gift_row.reservation_payment_key
      and payment_status in ('pending', 'in_process')
    returning * into payment_row;

    if found then
      insert into public.gift_payment_events (
        payment_id, gift_id, event_type, previous_status, next_status
      ) values (payment_row.id, gift_row.id, 'reservation_expired', prior_status, 'expired');
    end if;

    update public.gifts
    set reservation_payment_key = null,
        reservation_expires_at = null,
        reservation_in_process = false,
        updated_at = now()
    where id = p_gift_id;
  end if;

  insert into public.gift_payments (
    idempotency_key, guest_name, message, gift_id, gift_name, amount,
    currency_id, payment_status, reservation_expires_at, payment_method
  )
  values (
    p_idempotency_key, trim(p_guest_name), nullif(trim(p_message), ''),
    gift_row.id, gift_row.name, gift_row.value, 'BRL', 'pending',
    p_reservation_expires_at, p_payment_method
  )
  returning * into payment_row;

  update public.gifts
  set reservation_payment_key = p_idempotency_key,
      reservation_expires_at = p_reservation_expires_at,
      reservation_in_process = false,
      gifted_payment_key = null,
      gifted_at = null,
      manual_availability_override = false,
      updated_at = now()
  where id = p_gift_id;

  insert into public.gift_payment_events (
    payment_id, gift_id, event_type, previous_status, next_status, details
  ) values (
    payment_row.id, p_gift_id, 'payment_started', null, 'pending',
    jsonb_build_object('payment_method', p_payment_method)
  );

  return next payment_row;
end;
$$;

revoke all on function public.reserve_gift_payment(uuid, uuid, text, text, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.reserve_gift_payment(uuid, uuid, text, text, timestamptz, text)
to service_role;

create or replace function public.reserve_gift_payment(
  p_gift_id uuid,
  p_idempotency_key uuid,
  p_guest_name text,
  p_message text,
  p_reservation_expires_at timestamptz
)
returns setof public.gift_payments
language sql
security definer
set search_path = ''
as $$
  select * from public.reserve_gift_payment(
    p_gift_id, p_idempotency_key, p_guest_name, p_message,
    p_reservation_expires_at, 'card'
  );
$$;

revoke all on function public.reserve_gift_payment(uuid, uuid, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.reserve_gift_payment(uuid, uuid, text, text, timestamptz)
to service_role;

create or replace function public.apply_gift_payment_status(
  p_idempotency_key uuid,
  p_payment_id text,
  p_payment_updated_at timestamptz,
  p_payment_status text,
  p_amount numeric,
  p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.gift_payments%rowtype;
  prior_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;

  if p_payment_id is null
    or p_payment_id = ''
    or p_payment_updated_at is null
    or p_payment_status is null
    or p_payment_status not in (
      'approved', 'pending', 'in_process', 'rejected', 'cancelled',
      'expired', 'refunded', 'charged_back', 'in_mediation', 'unknown'
    )
    or p_amount is null
    or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Invalid payment update';
  end if;

  select * into payment_row
  from public.gift_payments
  where idempotency_key = p_idempotency_key;
  if not found then return false; end if;

  perform 1 from public.gifts where id = payment_row.gift_id for update;
  select * into payment_row
  from public.gift_payments
  where idempotency_key = p_idempotency_key
  for update;
  if not found then return false; end if;

  if payment_row.payment_method = 'pix'
    or (payment_row.mp_payment_updated_at is not null
      and p_payment_updated_at <= payment_row.mp_payment_updated_at)
    or (payment_row.payment_status = 'approved'
      and p_payment_status in ('pending', 'in_process', 'rejected', 'cancelled'))
    or (payment_row.payment_status in ('rejected', 'cancelled', 'expired')
      and p_payment_status in ('pending', 'in_process')) then
    return false;
  end if;

  prior_status := payment_row.payment_status;
  update public.gift_payments
  set mp_payment_id = p_payment_id,
      mp_payment_updated_at = p_payment_updated_at,
      amount = p_amount,
      payment_status = p_payment_status,
      paid_at = case when p_payment_status = 'approved'
        then coalesce(p_paid_at, paid_at, now()) else paid_at end,
      reservation_expires_at = case
        when p_payment_status in ('rejected', 'cancelled', 'expired') then now()
        else reservation_expires_at
      end,
      updated_at = now()
  where id = payment_row.id;

  insert into public.gift_payment_events (
    payment_id, gift_id, event_type, previous_status, next_status, details
  ) values (
    payment_row.id, payment_row.gift_id, 'card_payment_status_updated',
    prior_status, p_payment_status, jsonb_build_object('provider', 'mercado_pago')
  );

  if p_payment_status = 'approved' then
    update public.gifts
    set gifted_payment_key = p_idempotency_key,
        gifted_at = coalesce(p_paid_at, gifted_at, now()),
        reservation_payment_key = null,
        reservation_expires_at = null,
        reservation_in_process = false,
        manual_availability_override = false,
        updated_at = now()
    where id = payment_row.gift_id
      and reservation_payment_key = p_idempotency_key
      and not manual_availability_override
      and gifted_at is null;
  elsif p_payment_status in ('rejected', 'cancelled', 'expired') then
    update public.gifts
    set reservation_payment_key = null,
        reservation_expires_at = null,
        reservation_in_process = false,
        updated_at = now()
    where id = payment_row.gift_id
      and reservation_payment_key = p_idempotency_key;
  else
    update public.gifts
    set reservation_in_process = (p_payment_status = 'in_process'),
        updated_at = now()
    where id = payment_row.gift_id
      and reservation_payment_key = p_idempotency_key;
  end if;

  return true;
end;
$$;

revoke all on function public.apply_gift_payment_status(uuid, text, timestamptz, text, numeric, timestamptz)
from public, anon, authenticated;
grant execute on function public.apply_gift_payment_status(uuid, text, timestamptz, text, numeric, timestamptz)
to service_role;

create or replace function public.request_pix_confirmation(p_idempotency_key uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.gift_payments%rowtype;
  gift_row public.gifts%rowtype;
  prior_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;

  select * into payment_row from public.gift_payments
  where idempotency_key = p_idempotency_key;
  if not found then return 'not_found'; end if;

  select * into gift_row from public.gifts where id = payment_row.gift_id for update;
  select * into payment_row from public.gift_payments
  where idempotency_key = p_idempotency_key for update;

  if payment_row.payment_method <> 'pix' then return 'wrong_method'; end if;
  if payment_row.payment_status not in ('pending', 'in_process') then return 'not_pending'; end if;
  if gift_row.reservation_payment_key is distinct from p_idempotency_key
    or gift_row.reservation_expires_at is null
    or gift_row.reservation_expires_at <= now() then
    prior_status := payment_row.payment_status;
    update public.gift_payments
    set payment_status = 'expired', reservation_expires_at = coalesce(reservation_expires_at, now()),
        updated_at = now()
    where id = payment_row.id;
    insert into public.gift_payment_events (
      payment_id, gift_id, event_type, previous_status, next_status
    ) values (payment_row.id, payment_row.gift_id, 'reservation_expired', prior_status, 'expired');
    if gift_row.reservation_payment_key = p_idempotency_key then
      update public.gifts set reservation_payment_key = null,
        reservation_expires_at = null, reservation_in_process = false, updated_at = now()
      where id = gift_row.id;
    end if;
    return 'expired';
  end if;
  if payment_row.payment_status = 'in_process' then return 'already_requested'; end if;

  prior_status := payment_row.payment_status;
  update public.gift_payments
  set payment_status = 'in_process',
      confirmation_requested_at = now(),
      updated_at = now()
  where id = payment_row.id;

  insert into public.gift_payment_events (
    payment_id, gift_id, event_type, previous_status, next_status
  ) values (payment_row.id, payment_row.gift_id, 'pix_confirmation_requested', prior_status, 'in_process');

  update public.gifts set reservation_in_process = true, updated_at = now()
  where id = gift_row.id and reservation_payment_key = p_idempotency_key;
  return 'requested';
end;
$$;

revoke all on function public.request_pix_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.request_pix_confirmation(uuid) to service_role;

create or replace function public.admin_review_pix_payment(
  p_idempotency_key uuid,
  p_approve boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.gift_payments%rowtype;
  gift_row public.gifts%rowtype;
  next_status text;
begin
  if p_approve is null then
    raise exception using errcode = '22023', message = 'Invalid PIX review action';
  end if;

  if coalesce(auth.role(), '') <> 'authenticated'
    or not coalesce(public.is_wedding_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required';
  end if;

  select * into payment_row from public.gift_payments
  where idempotency_key = p_idempotency_key;
  if not found then raise exception using errcode = 'P0002', message = 'Payment not found'; end if;
  select * into gift_row from public.gifts where id = payment_row.gift_id for update;
  select * into payment_row from public.gift_payments
  where idempotency_key = p_idempotency_key for update;

  if payment_row.payment_method <> 'pix' or payment_row.payment_status <> 'in_process' then
    raise exception using errcode = 'P0001', message = 'PIX request is no longer awaiting review';
  end if;
  if gift_row.reservation_payment_key is distinct from p_idempotency_key
    or gift_row.reservation_expires_at is null
    or gift_row.reservation_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'Gift reservation expired or changed';
  end if;

  if p_approve then
    if not gift_row.available or gift_row.gifted_at is not null then
      raise exception using errcode = 'P0001', message = 'Gift is no longer available';
    end if;
    next_status := 'approved';
    update public.gift_payments
    set payment_status = next_status, confirmed_by = auth.uid(), reviewed_at = now(),
        paid_at = now(), updated_at = now()
    where id = payment_row.id;
    update public.gifts
    set gifted_payment_key = p_idempotency_key, gifted_at = now(),
        reservation_payment_key = null, reservation_expires_at = null,
        reservation_in_process = false, manual_availability_override = false,
        updated_at = now()
    where id = gift_row.id;
  else
    next_status := 'rejected';
    update public.gift_payments
    set payment_status = next_status, rejected_by = auth.uid(), reviewed_at = now(),
        reservation_expires_at = now(), updated_at = now()
    where id = payment_row.id;
    update public.gifts
    set reservation_payment_key = null, reservation_expires_at = null,
        reservation_in_process = false, updated_at = now()
    where id = gift_row.id and reservation_payment_key = p_idempotency_key;
  end if;

  insert into public.gift_payment_events (
    payment_id, gift_id, actor_id, event_type, previous_status, next_status
  ) values (
    payment_row.id, gift_row.id, auth.uid(),
    case when p_approve then 'pix_payment_confirmed' else 'pix_payment_rejected' end,
    payment_row.payment_status, next_status
  );

  return next_status;
end;
$$;

revoke all on function public.admin_review_pix_payment(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_review_pix_payment(uuid, boolean) to authenticated;

create or replace function public.admin_set_gift_availability(
  p_gift_id uuid,
  p_available boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  gift_row public.gifts%rowtype;
  payment_row public.gift_payments%rowtype;
begin
  if p_gift_id is null or p_available is null then
    raise exception using errcode = '22023', message = 'Invalid gift availability update';
  end if;

  if coalesce(auth.role(), '') <> 'authenticated'
    or not coalesce(public.is_wedding_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required';
  end if;

  select * into gift_row from public.gifts where id = p_gift_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Gift not found'; end if;

  if gift_row.reservation_payment_key is not null then
    select * into payment_row from public.gift_payments
    where idempotency_key = gift_row.reservation_payment_key for update;

    if gift_row.reservation_expires_at > now()
      and payment_row.payment_status in ('pending', 'in_process') then
      raise exception using errcode = 'P0001', message = 'Gift has an active reservation or payment review';
    end if;

    if payment_row.payment_status in ('pending', 'in_process') then
      insert into public.gift_payment_events (
        payment_id, gift_id, event_type, previous_status, next_status
      ) values (
        payment_row.id, p_gift_id, 'reservation_expired',
        payment_row.payment_status, 'expired'
      );
      update public.gift_payments
      set payment_status = 'expired',
          reservation_expires_at = coalesce(reservation_expires_at, now()),
          updated_at = now()
      where id = payment_row.id;
    end if;
  end if;

  update public.gifts
  set available = p_available,
      gifted_payment_key = case when p_available then null else gifted_payment_key end,
      gifted_at = case when p_available then null else gifted_at end,
      reservation_payment_key = null,
      reservation_expires_at = null,
      reservation_in_process = false,
      manual_availability_override = true,
      manual_availability_updated_at = now(),
      manual_availability_updated_by = auth.uid(),
      updated_at = now()
  where id = p_gift_id;

  insert into public.gift_payment_events (
    gift_id, actor_id, event_type, details
  ) values (
    p_gift_id, auth.uid(),
    case when p_available then 'gift_made_available' else 'gift_made_unavailable' end,
    jsonb_build_object('previous_available', gift_row.available, 'available', p_available)
  );

  return case when p_available then 'available' else 'unavailable' end;
end;
$$;

revoke all on function public.admin_set_gift_availability(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_gift_availability(uuid, boolean) to authenticated;
