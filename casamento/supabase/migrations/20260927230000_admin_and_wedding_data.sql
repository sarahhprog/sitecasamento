create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_auth_user();

create or replace function public.is_wedding_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  email text,
  phone text,
  party_size integer not null default 1 check (party_size > 0),
  companions jsonb not null default '[]'::jsonb,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'confirmed', 'declined')),
  confirmed_people integer not null default 0 check (confirmed_people >= 0),
  notes text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  status text not null check (status in ('confirmed', 'declined')),
  people_count integer not null default 0 check (people_count >= 0),
  notes text,
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  value numeric(10,2) not null default 0 check (value >= 0),
  category text not null default '',
  image_url text,
  file_url text,
  file_type text,
  available boolean not null default true,
  public_visible boolean not null default true,
  payment_link text,
  payment_identifier text,
  payment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  message text not null check (char_length(message) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  title text not null default '',
  category text not null default 'momentos-especiais',
  file_url text not null,
  file_type text not null,
  visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wedding_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.wedding_settings (key, value, is_public)
values
  ('couple', to_jsonb('Sarah & Hayato'::text), true),
  ('date', to_jsonb('2027-07-24T15:00:00-03:00'::text), true),
  ('dateLabel', to_jsonb('24.07.2027'::text), true),
  ('timeLabel', to_jsonb('15:00'::text), true),
  ('venue', to_jsonb('Espaço Bodocó'::text), true),
  ('city', to_jsonb('Betim - MG'::text), true)
on conflict (key) do nothing;

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null default '',
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.rsvps enable row level security;
alter table public.gifts enable row level security;
alter table public.messages enable row level security;
alter table public.photos enable row level security;
alter table public.wedding_settings enable row level security;
alter table public.faqs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.guests, public.rsvps, public.gifts,
  public.messages, public.photos, public.wedding_settings, public.faqs to authenticated;
grant select on public.photos, public.wedding_settings, public.faqs to anon;
grant insert on public.messages to anon;

create policy "profiles_read_self_or_admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_wedding_admin()));

create policy "profiles_admin_manage"
on public.profiles for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create policy "guests_admin_manage"
on public.guests for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create policy "rsvps_admin_read"
on public.rsvps for select to authenticated
using ((select public.is_wedding_admin()));

create policy "gifts_public_read_available"
on public.gifts for select to anon, authenticated
using (public_visible or (select public.is_wedding_admin()));

create policy "gifts_admin_manage"
on public.gifts for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

revoke all on public.gifts from anon;
grant select (id, name, description, value, category, image_url, file_url, file_type, available, public_visible, created_at)
on public.gifts to anon;

insert into public.gifts (name, description, value, category, available)
select seed.name, seed.description, seed.value, seed.category, true
from (values
  ('Jantar romântico', 'Uma noite especial para celebrarmos a dois.', 180::numeric, 'Experiências'),
  ('Café da manhã especial', 'Um começo de dia tranquilo e cheio de carinho.', 120::numeric, 'Experiências'),
  ('Jogo de cama', 'Conforto para o nosso novo capítulo juntos.', 260::numeric, 'Casa'),
  ('Toalhas para a casa', 'Pequenos detalhes que deixam a casa mais acolhedora.', 150::numeric, 'Casa'),
  ('Mala de viagem', 'Para continuarmos colecionando caminhos e histórias.', 340::numeric, 'Viagens'),
  ('Jantar durante a lua de mel', 'Uma experiência deliciosa em um lugar especial.', 220::numeric, 'Viagens'),
  ('Passeio para o casal', 'Um dia para descobrir um lugar novo lado a lado.', 200::numeric, 'Experiências'),
  ('Itens para a cozinha', 'Para preparar muitas refeições e memórias em casa.', 190::numeric, 'Casa')
) as seed(name, description, value, category)
where not exists (select 1 from public.gifts);

create policy "messages_public_insert"
on public.messages for insert to anon, authenticated
with check (
  char_length(trim(name)) between 1 and 120
  and char_length(trim(message)) between 1 and 3000
);

create policy "messages_admin_read_delete"
on public.messages for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create policy "photos_public_read_visible"
on public.photos for select to anon, authenticated
using (visible or (select public.is_wedding_admin()));

create policy "photos_admin_manage"
on public.photos for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create policy "wedding_settings_public_read"
on public.wedding_settings for select to anon, authenticated
using (is_public or (select public.is_wedding_admin()));

create policy "wedding_settings_admin_manage"
on public.wedding_settings for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create policy "faqs_public_read_published"
on public.faqs for select to anon, authenticated
using (published or (select public.is_wedding_admin()));

create policy "faqs_admin_manage"
on public.faqs for all to authenticated
using ((select public.is_wedding_admin()))
with check ((select public.is_wedding_admin()));

create or replace function public.lookup_invitation(invitation_text text)
returns table (
  id uuid,
  name text,
  party_size integer,
  rsvp_status text,
  confirmed_people integer
)
language sql
security definer
set search_path = ''
as $$
  select g.id, g.name, g.party_size, g.rsvp_status, g.confirmed_people
  from public.guests g
  where lower(g.invite_code) = lower(trim(invitation_text))
     or lower(g.name) = lower(trim(invitation_text))
  order by (lower(g.invite_code) = lower(trim(invitation_text))) desc
  limit 1;
$$;

create or replace function public.submit_invitation_rsvp(
  invitation_id uuid,
  will_attend boolean,
  people_count integer default 0,
  response_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.guests%rowtype;
  next_status text;
  next_people integer;
begin
  select * into invitation
  from public.guests
  where id = invitation_id
  for update;

  if not found then
    raise exception 'Convite não encontrado.';
  end if;

  next_status := case when will_attend then 'confirmed' else 'declined' end;
  next_people := case when will_attend then people_count else 0 end;

  if next_people < 0 or next_people > invitation.party_size then
    raise exception 'Quantidade de pessoas inválida para este convite.';
  end if;

  update public.guests
  set rsvp_status = next_status,
      confirmed_people = next_people,
      responded_at = now(),
      updated_at = now()
  where id = invitation_id;

  insert into public.rsvps (guest_id, status, people_count, notes)
  values (invitation_id, next_status, next_people, nullif(trim(response_notes), ''));
end;
$$;

revoke all on function public.lookup_invitation(text) from public;
grant execute on function public.lookup_invitation(text) to anon, authenticated;
revoke all on function public.submit_invitation_rsvp(uuid, boolean, integer, text) from public;
grant execute on function public.submit_invitation_rsvp(uuid, boolean, integer, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-assets', 'wedding-assets', true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "wedding_assets_public_read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'wedding-assets');

create policy "wedding_assets_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'wedding-assets' and (select public.is_wedding_admin()));

create policy "wedding_assets_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'wedding-assets' and (select public.is_wedding_admin()))
with check (bucket_id = 'wedding-assets' and (select public.is_wedding_admin()));

create policy "wedding_assets_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'wedding-assets' and (select public.is_wedding_admin()));

-- Primeiro administrador: crie a conta em /admin/cadastro e promova-a uma única vez
-- no SQL Editor do Supabase após confirmar o endereço de e-mail:
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'EMAIL_DO_ADMIN');
