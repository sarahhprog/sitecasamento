create table if not exists public.gift_payments (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  guest_name text not null check (char_length(trim(guest_name)) between 1 and 120),
  message text check (message is null or char_length(message) <= 300),
  gift_id uuid not null references public.gifts(id) on delete restrict,
  gift_name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency_id text not null default 'BRL' check (currency_id = 'BRL'),
  preference_id text unique,
  mp_payment_id text unique,
  mp_payment_updated_at timestamptz,
  payment_status text not null default 'pending'
    check (payment_status in (
      'pending', 'in_process', 'approved', 'rejected', 'cancelled',
      'refunded', 'charged_back', 'in_mediation', 'unknown'
    )),
  checkout_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_payments_checkout_pair check (
    (preference_id is null) = (checkout_url is null)
  )
);

create index if not exists gift_payments_created_at_idx
  on public.gift_payments (created_at desc);

create index if not exists gift_payments_status_idx
  on public.gift_payments (payment_status);

alter table public.gift_payments enable row level security;

revoke all on public.gift_payments from public, anon, authenticated;
grant select on public.gift_payments to authenticated;
grant select, insert, update on public.gift_payments to service_role;

drop policy if exists gift_payments_admin_read on public.gift_payments;
create policy gift_payments_admin_read
  on public.gift_payments for select to authenticated
  using ((select public.is_wedding_admin()));