-- Bubbly-fi mobile apps — backend support migration
--
-- Adds what the customer and staff mobile apps need that the existing
-- Bubblyfi-POS web system doesn't have yet:
--   1. get_my_requests(phone) — lets a customer look up their own
--      booking/order status by phone number. There was previously NO
--      read path for customers at all (anon only had execute on
--      submit_customer_order and get_public_booking_options).
--   2. push_tokens — stores Expo push tokens for admin/operator devices.
--   3. push_sent_at — idempotency column on customer_order_requests,
--      matching the existing customer_sms_sent_at / shop_sms_sent_at /
--      shop_email_sent_at pattern.
--   4. A trigger that calls the new send-push-notification Edge
--      Function whenever a new customer_order_request comes in, via
--      pg_net (so it fires even if the customer's app doesn't make a
--      follow-up call, unlike the existing SMS function which is
--      client-invoked).
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- the same project the Bubblyfi-POS web app already uses. Nothing here
-- deletes or alters existing rows/columns from the POS system.

-- 1. Customer-facing read RPC ------------------------------------------------

create or replace function public.get_my_requests(p_phone text)
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
  normalized text;
  digits text;
begin
  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if digits ~ '^639[0-9]{9}$' then
    normalized := '+' || digits;
  elsif digits ~ '^09[0-9]{9}$' then
    normalized := '+63' || substring(digits from 2);
  elsif digits ~ '^9[0-9]{9}$' then
    normalized := '+63' || digits;
  else
    raise exception 'Invalid Philippine mobile number';
  end if;

  return query
    select
      r.id, r.request_no, r.item_type, r.quantity, r.unit, r.loads, r.place, r.total,
      r.status, r.delivery_requested, r.full_address, r.pickup_at, r.created_at,
      o.status as order_status, o.receipt_no
    from public.customer_order_requests r
    left join public.orders o on o.id = r.converted_order_id
    where r.phone = normalized
    order by r.created_at desc
    limit 50;
end;
$$;

revoke all on function public.get_my_requests(text) from public;
grant execute on function public.get_my_requests(text) to anon, authenticated;

-- 2. Push token storage -------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_profile_id_idx on public.push_tokens(profile_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Staff manage own push tokens" on public.push_tokens;
create policy "Staff manage own push tokens"
  on public.push_tokens
  for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Service role (used by the Edge Function) bypasses RLS automatically.

-- 3. Idempotency column on customer_order_requests ---------------------------

alter table public.customer_order_requests
  add column if not exists push_sent_at timestamptz;

-- 4. Trigger: notify staff app on new customer request ------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_customer_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('request_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists customer_request_push_notify on public.customer_order_requests;
create trigger customer_request_push_notify
  after insert on public.customer_order_requests
  for each row execute function public.notify_new_customer_request();
