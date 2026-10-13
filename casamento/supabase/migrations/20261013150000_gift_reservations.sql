alter table public.gifts
  add column if not exists reservation_payment_key uuid
    references public.gift_payments (idempotency_key) on delete set null,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists reservation_in_process boolean not null default false,
  add column if not exists gifted_payment_key uuid
    references public.gift_payments (idempotency_key) on delete set null,
  add column if not exists gifted_at timestamptz;

alter table public.gift_payments
  add column if not exists reservation_expires_at timestamptz;

alter table public.gift_payments
  drop constraint if exists gift_payments_payment_status_check;

alter table public.gift_payments
  add constraint gift_payments_payment_status_check
  check (payment_status in (
    'pending', 'in_process', 'approved', 'rejected', 'cancelled',
    'expired', 'refunded', 'charged_back', 'in_mediation', 'unknown'
  ));

with latest_approved_payment as (
  select distinct on (gift_id)
    gift_id,
    idempotency_key,
    coalesce(paid_at, created_at) as gifted_at
  from public.gift_payments
  where payment_status = 'approved'
  order by gift_id, coalesce(paid_at, created_at) desc
)
update public.gifts as gift
set gifted_payment_key = payment.idempotency_key,
    gifted_at = payment.gifted_at
from latest_approved_payment as payment
where gift.id = payment.gift_id
  and gift.gifted_at is null;

update public.gift_payments
set reservation_expires_at = now() + interval '30 minutes'
where payment_status in ('pending', 'in_process')
  and preference_id is not null
  and checkout_url is not null
  and reservation_expires_at is null;

with active_reservations as (
  select distinct on (gift_id)
    gift_id,
    idempotency_key,
    payment_status,
    reservation_expires_at
  from public.gift_payments
  where payment_status in ('pending', 'in_process')
    and reservation_expires_at > now()
  order by gift_id, created_at desc
)
update public.gifts as gift
set reservation_payment_key = reservation.idempotency_key,
    reservation_expires_at = reservation.reservation_expires_at,
    reservation_in_process = reservation.payment_status = 'in_process'
from active_reservations as reservation
where gift.id = reservation.gift_id
  and gift.gifted_at is null
  and gift.reservation_payment_key is null;

create unique index if not exists gifts_reservation_payment_key_uidx
  on public.gifts (reservation_payment_key)
  where reservation_payment_key is not null;

grant select (
  id, name, description, value, category, image_url, file_url, file_type,
  available, public_visible, created_at, reservation_expires_at,
  reservation_in_process, gifted_at
)
on public.gifts to anon;

grant select (
  reservation_payment_key, reservation_expires_at, reservation_in_process,
  gifted_payment_key, gifted_at
)
on public.gifts to service_role;

create or replace function public.reserve_gift_payment(
  p_gift_id uuid,
  p_idempotency_key uuid,
  p_guest_name text,
  p_message text,
  p_reservation_expires_at timestamptz
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;

  if p_guest_name is null
    or char_length(trim(p_guest_name)) not between 1 and 120
    or (p_message is not null and char_length(p_message) > 300)
    or p_reservation_expires_at <= now()
    or p_reservation_expires_at > now() + interval '31 minutes' then
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
      or payment_row.message is distinct from nullif(trim(p_message), '') then
      raise exception using errcode = '23505', message = 'Idempotency key does not match checkout';
    end if;

    if payment_row.payment_status not in ('pending', 'in_process')
      or gift_row.reservation_payment_key is distinct from p_idempotency_key
      or (
        payment_row.payment_status = 'pending'
        and (
          gift_row.reservation_expires_at is null
          or gift_row.reservation_expires_at <= now()
        )
      ) then
      return;
    end if;

    return next payment_row;
    return;
  end if;

  if not gift_row.available
    or not gift_row.public_visible
    or gift_row.gifted_at is not null then
    return;
  end if;

  if gift_row.reservation_payment_key is not null then
    select * into payment_row
    from public.gift_payments
    where idempotency_key = gift_row.reservation_payment_key
    for update;

    if found and payment_row.payment_status in ('approved', 'in_process') then
      return;
    end if;

    if gift_row.reservation_expires_at is null
      or gift_row.reservation_expires_at > now() then
      return;
    end if;

    update public.gift_payments
    set payment_status = 'cancelled',
        reservation_expires_at = now(),
        updated_at = now()
    where idempotency_key = gift_row.reservation_payment_key
      and payment_status in ('pending', 'in_process');

    update public.gifts
    set reservation_payment_key = null,
        reservation_expires_at = null,
        updated_at = now()
    where id = p_gift_id;
  end if;

  insert into public.gift_payments (
    idempotency_key,
    guest_name,
    message,
    gift_id,
    gift_name,
    amount,
    currency_id,
    payment_status,
    reservation_expires_at
  )
  values (
    p_idempotency_key,
    trim(p_guest_name),
    nullif(trim(p_message), ''),
    gift_row.id,
    gift_row.name,
    gift_row.value,
    'BRL',
    'pending',
    p_reservation_expires_at
  )
  returning * into payment_row;

  update public.gifts
  set reservation_payment_key = p_idempotency_key,
      reservation_expires_at = p_reservation_expires_at,
      updated_at = now()
  where id = p_gift_id;

  return next payment_row;
end;
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;

  if p_payment_id is null
    or p_payment_id = ''
    or p_payment_updated_at is null
    or p_payment_status is null
    or p_amount is null
    or p_payment_status not in (
    'approved', 'pending', 'in_process', 'rejected', 'cancelled',
    'expired', 'refunded', 'charged_back', 'in_mediation', 'unknown'
  ) or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Invalid payment update';
  end if;

  select * into payment_row
  from public.gift_payments
  where idempotency_key = p_idempotency_key;

  if not found then
    return false;
  end if;

  perform 1
  from public.gifts
  where id = payment_row.gift_id
  for update;

  select * into payment_row
  from public.gift_payments
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    return false;
  end if;

  if payment_row.mp_payment_updated_at is not null
    and p_payment_updated_at <= payment_row.mp_payment_updated_at then
    return false;
  end if;

  if payment_row.payment_status = 'approved'
    and p_payment_status in ('pending', 'in_process', 'rejected', 'cancelled') then
    return false;
  end if;

  if payment_row.payment_status in ('rejected', 'cancelled', 'expired')
    and p_payment_status in ('pending', 'in_process') then
    return false;
  end if;

  update public.gift_payments
  set mp_payment_id = p_payment_id,
      mp_payment_updated_at = p_payment_updated_at,
      amount = p_amount,
      payment_status = p_payment_status,
      paid_at = case
        when p_payment_status = 'approved' then coalesce(p_paid_at, paid_at, now())
        else paid_at
      end,
      reservation_expires_at = case
        when p_payment_status in ('rejected', 'cancelled', 'expired') then now()
        else reservation_expires_at
      end,
      updated_at = now()
  where id = payment_row.id;

  if p_payment_status = 'approved' then
    update public.gifts
    set gifted_payment_key = p_idempotency_key,
        gifted_at = coalesce(p_paid_at, gifted_at, now()),
        reservation_payment_key = null,
        reservation_expires_at = null,
        reservation_in_process = false,
        updated_at = now()
    where id = payment_row.gift_id
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
