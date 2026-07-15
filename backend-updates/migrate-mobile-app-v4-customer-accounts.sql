-- Bubbly-fi mobile apps — customer accounts (Google/Facebook OAuth)
--
-- IMPORTANT — this migration also fixes a real privilege-escalation bug
-- that becomes exploitable the moment customers can sign up via Supabase
-- Auth. The existing public.handle_new_user() trigger fires on EVERY
-- insert into auth.users and unconditionally inserts a row into
-- public.profiles (defaulting role to 'operator' unless raw_user_meta_data
-- ->>'role' = 'admin'). The two real staff accounts (admin@bubblyfi.app,
-- operator@bubblyfi.app) are actually assigned their role by a one-time
-- UPDATE matched on email, not by that metadata key — so today this
-- unconditional insert has only ever run for those two manually-created
-- accounts. Once customers can sign up themselves (this migration), any
-- customer who signs in with Google/Facebook would silently be inserted
-- into public.profiles with role='operator', which is.is_staff() reads —
-- i.e. every customer would gain full staff access to orders, customers,
-- inventory, and every admin-only RPC.
--
-- The fix: gate handle_new_user() on the auth provider. Staff accounts are
-- always created as email+password accounts (Supabase dashboard); customer
-- accounts (this migration) always sign up via Google/Facebook OAuth. That
-- split is not spoofable by the signing-up user, unlike a metadata key.
--
-- This migration adds:
--   1. The handle_new_user() fix described above.
--   2. customer_profiles — parallel to staff `profiles`, RLS-scoped to
--      auth.uid(), auto-populated on OAuth signup by
--      handle_new_customer_user().
--   3. get_my_requests_for_account() — same read as get_my_requests(phone)
--      but for an authenticated session, matching on the account's own
--      phone once it's set.
--
-- Accounts are ADDITIVE: the existing phone-only guest flow
-- (submit_customer_order, get_my_requests(phone)) is completely unchanged
-- and keeps working for anyone who doesn't want to sign in.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1, v2, and v3.

-- 1. Fix the staff-provisioning trigger to not fire for OAuth signups -------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'provider' = 'email' then
    insert into public.profiles (id, display_name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
      case when new.raw_user_meta_data->>'role' = 'admin' then 'admin' else 'operator' end
    ) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- 2. Customer accounts ----------------------------------------------------

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

drop policy if exists "Customers manage their own profile" on public.customer_profiles;
create policy "Customers manage their own profile"
  on public.customer_profiles
  for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_new_customer_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'provider' in ('google', 'facebook') then
    insert into public.customer_profiles (id, phone, display_name)
    values (
      new.id,
      nullif(new.raw_user_meta_data->>'phone', ''),
      coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(coalesce(new.email, ''), '@', 1),
        'Bubbly-fi customer'
      )
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer on auth.users;
create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function public.handle_new_customer_user();

create or replace function public.update_my_customer_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  normalized := public.normalize_ph_mobile(p_phone);
  if normalized is null then
    raise exception using errcode = '22023', message = 'Invalid Philippine mobile number.';
  end if;
  update public.customer_profiles set phone = normalized, updated_at = now() where id = auth.uid();
end;
$$;

revoke all on function public.update_my_customer_phone(text) from public;
grant execute on function public.update_my_customer_phone(text) to authenticated;

-- 3. Read-your-own-history for signed-in accounts --------------------------

create or replace function public.get_my_requests_for_account()
returns table (
  id uuid,
  request_no text,
  item_type text,
  quantity numeric,
  unit text,
  loads integer,
  place text,
  total numeric,
  status text,
  delivery_requested boolean,
  full_address text,
  pickup_at timestamptz,
  created_at timestamptz,
  order_status text,
  receipt_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select phone into v_phone from public.customer_profiles where id = auth.uid();
  if v_phone is null then
    return;
  end if;

  return query
    select
      r.id, r.request_no, r.item_type, r.quantity, r.unit, r.loads, r.place, r.total,
      r.status, r.delivery_requested, r.full_address, r.pickup_at, r.created_at,
      o.status as order_status, o.receipt_no
    from public.customer_order_requests r
    left join public.orders o on o.id = r.converted_order_id
    where r.phone = v_phone
    order by r.created_at desc
    limit 50;
end;
$$;

revoke all on function public.get_my_requests_for_account() from public;
grant execute on function public.get_my_requests_for_account() to authenticated;
