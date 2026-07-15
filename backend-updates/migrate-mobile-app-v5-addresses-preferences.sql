-- Bubbly-fi mobile apps — saved addresses + wash preferences
--
-- Both are only available to signed-in customer accounts (see v4). There
-- was no reusable address book (every booking re-enters a freeform
-- address) and no way to persist a customer's default wash preferences
-- across orders.
--
-- Both tables use simple owner-scoped RLS (customer_profile_id = auth.uid())
-- rather than security definer RPCs — the client can call
-- sb.from('saved_addresses')/.from('wash_preferences') directly, and RLS's
-- `with check` clause rejects any attempt to write another customer's row
-- even if the client sent the wrong id.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v4.

-- 1. Saved addresses ------------------------------------------------------

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  label text not null,
  address_line text,
  building_unit text,
  barangay text,
  city text default 'Quezon City',
  landmark text,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_addresses_profile_idx on public.saved_addresses(customer_profile_id);

alter table public.saved_addresses enable row level security;

drop policy if exists "Customers manage their own addresses" on public.saved_addresses;
create policy "Customers manage their own addresses"
  on public.saved_addresses
  for all
  to authenticated
  using (customer_profile_id = auth.uid())
  with check (customer_profile_id = auth.uid());

create or replace function public.enforce_single_default_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.saved_addresses
    set is_default = false
    where customer_profile_id = new.customer_profile_id
      and id <> new.id
      and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_addresses_single_default on public.saved_addresses;
create trigger saved_addresses_single_default
  after insert or update of is_default on public.saved_addresses
  for each row when (new.is_default) execute function public.enforce_single_default_address();

-- 2. Wash preferences -------------------------------------------------------

create table if not exists public.wash_preferences (
  customer_profile_id uuid primary key references public.customer_profiles(id) on delete cascade,
  water_temp text not null default 'cold' check (water_temp in ('cold', 'warm', 'hot')),
  detergent_type text,
  fabric_softener boolean not null default false,
  fabric_softener_type text,
  zonrox boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.wash_preferences enable row level security;

drop policy if exists "Customers manage their own wash preferences" on public.wash_preferences;
create policy "Customers manage their own wash preferences"
  on public.wash_preferences
  for all
  to authenticated
  using (customer_profile_id = auth.uid())
  with check (customer_profile_id = auth.uid());
