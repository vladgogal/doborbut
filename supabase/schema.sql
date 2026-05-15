-- ============================================================
-- Добробут — Supabase Schema
-- Run in Supabase Dashboard -> SQL Editor
-- ============================================================

-- profiles
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  full_name   text,
  phone       text,
  updated_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Own profile select" on public.profiles for select using (auth.uid() = id);
create policy "Own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "Own profile update" on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- orders
create table if not exists public.orders (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users on delete set null,
  order_number     bigint generated always as identity,
  status           text default 'new' check (status in ('new','confirmed','in_transit','delivered','cancelled')),
  items            jsonb not null default '[]',
  total            numeric(10,2) not null default 0,
  delivery_cost    numeric(10,2) default 0,
  delivery_method  text,
  payment_method   text default 'cod',
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  city             text,
  delivery_address text,
  created_at       timestamptz default now()
);
alter table public.orders enable row level security;
create policy "Users view own orders" on public.orders for select using (auth.uid() = user_id);
create policy "Anyone can insert orders" on public.orders for insert with check (true);

-- addresses
create table if not exists public.addresses (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  title       text default 'Adresa',
  city        text,
  street      text,
  apartment   text,
  is_default  boolean default false,
  created_at  timestamptz default now()
);
alter table public.addresses enable row level security;
create policy "Users manage own addresses" on public.addresses for all using (auth.uid() = user_id);

-- ALTER: patch orders if created without newer columns
alter table public.orders add column if not exists delivery_method  text;
alter table public.orders add column if not exists contact_name     text;
alter table public.orders add column if not exists contact_phone    text;
alter table public.orders add column if not exists contact_email    text;
alter table public.orders add column if not exists city             text;
alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists delivery_cost    numeric(10,2) default 0;

-- Ensure RLS policies exist (safe to re-run)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='orders' and policyname='Users view own orders'
  ) then
    create policy "Users view own orders" on public.orders for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename='orders' and policyname='Anyone can insert orders'
  ) then
    create policy "Anyone can insert orders" on public.orders for insert with check (true);
  end if;
end $$;

-- Profile: ensure row exists for current users who missed the trigger
insert into public.profiles (id)
select id from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;

-- ALTER: add Nova Poshta fields to addresses (run if table already exists)
alter table public.addresses add column if not exists recipient_name text;
alter table public.addresses add column if not exists city_ref      text;
alter table public.addresses add column if not exists warehouse     text;
alter table public.addresses add column if not exists warehouse_ref text;
-- drop old columns no longer needed
alter table public.addresses drop column if exists street;
alter table public.addresses drop column if exists apartment;
