-- Bubbly-fi mobile apps — FCM push + status-change notifications
--
-- The v1 migration only pushed a message to STAFF devices (via Expo push
-- tokens) when a brand-new customer_order_requests row was inserted.
-- Neither native Kotlin app (customer-android, operations-android) has any
-- push notification infrastructure at all yet, and there was no path to
-- notify a CUSTOMER of anything.
--
-- This migration adds:
--   1. customer_devices — FCM tokens for customer devices, keyed by phone
--      (customers have no Supabase Auth session, same trust model as the
--      existing get_my_requests(phone) RPC).
--   2. upsert_customer_device(...) — RPC the customer app calls once it has
--      an FCM token (right after a successful booking, when the phone is
--      known).
--   3. push_tokens gains a nullable fcm_token column alongside the existing
--      expo_push_token column, plus upsert_staff_push_token(...) so the
--      native operations-android app can register too, without disturbing
--      whatever still uses the Expo-based admin-app.
--   4. notification_log — idempotency ledger so a status update never
--      double-sends (mirrors the *_sent_at column pattern, generalized
--      since this now covers two tables and many status values).
--   5. Triggers on customer_order_requests and orders that fire on STATUS
--      CHANGE (not just insert) and call the (rewritten) send-push-notification
--      function, which now sends via FCM instead of Expo's push API.
--   6. notify_rider_approaching(...) — called directly by the operations
--      app's manual "On my way" button; computes distance from the rider's
--      one-shot GPS reading to the customer's saved pickup pin using the
--      existing bubblyfi_distance_meters() helper, then sends the push.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1. Nothing here deletes or alters existing rows.

-- 1. Customer device tokens ---------------------------------------------------

create table if not exists public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  fcm_token text not null unique,
  notif_sound boolean not null default true,
  notif_vibration boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_devices_phone_idx on public.customer_devices(phone);

alter table public.customer_devices enable row level security;

-- Customers have no Supabase Auth session, so there is no auth.uid() to scope
-- RLS to (same reasoning as get_my_requests(phone)). All reads/writes happen
-- through the security definer RPC below or the service-role Edge Function.
drop policy if exists "No direct access to customer_devices" on public.customer_devices;
create policy "No direct access to customer_devices"
  on public.customer_devices
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.upsert_customer_device(
  p_phone text,
  p_fcm_token text,
  p_sound boolean default true,
  p_vibration boolean default true
)
returns void
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

  if p_fcm_token is null or length(trim(p_fcm_token)) = 0 then
    raise exception 'fcm_token is required';
  end if;

  insert into public.customer_devices (phone, fcm_token, notif_sound, notif_vibration)
  values (normalized, p_fcm_token, coalesce(p_sound, true), coalesce(p_vibration, true))
  on conflict (fcm_token) do update
    set phone = excluded.phone,
        notif_sound = excluded.notif_sound,
        notif_vibration = excluded.notif_vibration,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_customer_device(text, text, boolean, boolean) from public;
grant execute on function public.upsert_customer_device(text, text, boolean, boolean) to anon, authenticated;

-- 2. Staff device tokens (operations-android) ---------------------------------

alter table public.push_tokens alter column expo_push_token drop not null;
alter table public.push_tokens add column if not exists fcm_token text unique;
alter table public.push_tokens drop constraint if exists push_tokens_has_a_token;
alter table public.push_tokens add constraint push_tokens_has_a_token
  check (expo_push_token is not null or fcm_token is not null);

create or replace function public.upsert_staff_push_token(p_fcm_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if p_fcm_token is null or length(trim(p_fcm_token)) = 0 then
    raise exception 'fcm_token is required';
  end if;

  insert into public.push_tokens (profile_id, fcm_token)
  values (auth.uid(), p_fcm_token)
  on conflict (fcm_token) do update
    set profile_id = excluded.profile_id,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_staff_push_token(text) from public;
grant execute on function public.upsert_staff_push_token(text) to authenticated;

-- 3. Notification idempotency ledger ------------------------------------------

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, status)
);

-- 4. Status-change triggers ----------------------------------------------------

create or replace function public.notify_customer_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('Confirmed', 'Scheduled', 'Rejected') then
    return new;
  end if;

  insert into public.notification_log (entity_type, entity_id, status)
  values ('customer_order_request', new.id, new.status)
  on conflict (entity_type, entity_id, status) do nothing
  returning true into claimed;

  if claimed then
    perform net.http_post(
      url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'request_status', 'request_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists customer_request_status_notify on public.customer_order_requests;
create trigger customer_request_status_notify
  after update of status on public.customer_order_requests
  for each row execute function public.notify_customer_request_status();

create or replace function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('Washing', 'Drying', 'Ready', 'Claimed') then
    return new;
  end if;

  insert into public.notification_log (entity_type, entity_id, status)
  values ('order', new.id, new.status)
  on conflict (entity_type, entity_id, status) do nothing
  returning true into claimed;

  if claimed then
    perform net.http_post(
      url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'order_status', 'order_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists order_status_notify on public.orders;
create trigger order_status_notify
  after update of status on public.orders
  for each row execute function public.notify_order_status();

-- 5. Manual "rider is approaching" trigger (called from operations-android) ---

create or replace function public.notify_rider_approaching(
  p_order_id uuid,
  p_rider_lat numeric,
  p_rider_lng numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin_lat numeric;
  v_pin_lng numeric;
  v_distance numeric;
begin
  if not public.is_staff() then
    raise exception 'Only staff can send rider-approaching notifications';
  end if;

  select r.gps_lat, r.gps_lng
  into v_pin_lat, v_pin_lng
  from public.orders o
  left join public.customer_order_requests r on r.converted_order_id = o.id
  where o.id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_pin_lat is not null and v_pin_lng is not null then
    v_distance := public.bubblyfi_distance_meters(p_rider_lat, p_rider_lng, v_pin_lat, v_pin_lng);
  end if;

  perform net.http_post(
    url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'rider_approaching', 'order_id', p_order_id, 'distance_m', v_distance)
  );

  return jsonb_build_object('ok', true, 'distance_m', v_distance);
end;
$$;

revoke all on function public.notify_rider_approaching(uuid, numeric, numeric) from public;
grant execute on function public.notify_rider_approaching(uuid, numeric, numeric) to authenticated;
