-- Bubbly-fi mobile apps — marketing broadcast by area
--
-- customer_devices (v2) had no concept of area or marketing opt-in — it
-- existed purely to route order-status pushes to the right device. This
-- migration adds:
--   1. last_known_area / marketing_opt_in columns.
--   2. upsert_customer_device(...) gains a 5th optional p_area
--      parameter (Postgres allows adding trailing default-valued
--      parameters via CREATE OR REPLACE without creating a duplicate
--      overload) so the customer app can report area on every booking.
--   3. count_marketing_recipients(area) / broadcast_marketing(area,
--      title, body) — admin-only (is_staff()), used by the ops app's
--      new Broadcast panel to preview a recipient count before sending,
--      then trigger the send-marketing-broadcast Edge Function.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1 and v2.

alter table public.customer_devices
  add column if not exists last_known_area text,
  add column if not exists marketing_opt_in boolean not null default true;

create or replace function public.upsert_customer_device(
  p_phone text,
  p_fcm_token text,
  p_sound boolean default true,
  p_vibration boolean default true,
  p_area text default null
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

  insert into public.customer_devices (phone, fcm_token, notif_sound, notif_vibration, last_known_area)
  values (normalized, p_fcm_token, coalesce(p_sound, true), coalesce(p_vibration, true), p_area)
  on conflict (fcm_token) do update
    set phone = excluded.phone,
        notif_sound = excluded.notif_sound,
        notif_vibration = excluded.notif_vibration,
        last_known_area = coalesce(excluded.last_known_area, public.customer_devices.last_known_area),
        updated_at = now();
end;
$$;

revoke all on function public.upsert_customer_device(text, text, boolean, boolean, text) from public;
grant execute on function public.upsert_customer_device(text, text, boolean, boolean, text) to anon, authenticated;

create or replace function public.count_marketing_recipients(p_area text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.customer_devices
  where marketing_opt_in
    and (p_area = 'all' or last_known_area = p_area);
$$;

revoke all on function public.count_marketing_recipients(text) from public;
grant execute on function public.count_marketing_recipients(text) to authenticated;

create or replace function public.broadcast_marketing(p_area text, p_title text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_staff() then
    raise exception 'Only staff can send marketing broadcasts';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_body), '') is null then
    raise exception 'Title and body are required';
  end if;

  v_count := public.count_marketing_recipients(p_area);

  perform net.http_post(
    url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-marketing-broadcast',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('area', p_area, 'title', p_title, 'body', p_body)
  );

  return jsonb_build_object('ok', true, 'recipient_count', v_count);
end;
$$;

revoke all on function public.broadcast_marketing(text, text, text) from public;
grant execute on function public.broadcast_marketing(text, text, text) to authenticated;
