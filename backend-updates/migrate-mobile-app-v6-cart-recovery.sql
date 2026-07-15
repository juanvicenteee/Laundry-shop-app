-- Bubbly-fi mobile apps — abandoned-cart reminders
--
-- The booking form only ever wrote a row once submit_customer_order was
-- called; there was no server-side concept of an in-progress draft, so
-- there was nothing to check for abandonment. This migration adds:
--   1. booking_drafts — one row per device (keyed by FCM token, so it
--      works for guests too, no account required), holding the last
--      selected pickup slot + a summary of the in-progress booking.
--      The client calls save_booking_draft(...) right after a pickup
--      slot is chosen, well before the final "Submit paid booking" tap.
--   2. pg_cron, scheduled every 5 minutes, calling the new
--      send-cart-abandonment-reminders Edge Function via pg_net (same
--      pattern as the existing status-change triggers, just time-based
--      instead of event-based). It finds drafts older than 30 minutes
--      with no reminder sent yet and pushes:
--      "Your laundry basket is full! Complete your booking now."
--
-- Requires the pg_cron extension. If `create extension pg_cron` below
-- errors with a permissions message, enable it yourself first via
-- Supabase Dashboard → Database → Extensions → pg_cron, then re-run
-- just the "3. Scheduled job" section below.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1 and v2 (it reuses the send-push-notification FCM pattern).

-- 1. Draft storage ----------------------------------------------------------

create table if not exists public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  fcm_token text not null unique,
  selected_slot timestamptz,
  service_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminded_at timestamptz
);

alter table public.booking_drafts enable row level security;

-- Same trust model as customer_devices: no session to scope RLS to, so all
-- access happens through the security definer RPCs below or the
-- service-role Edge Function.
drop policy if exists "No direct access to booking_drafts" on public.booking_drafts;
create policy "No direct access to booking_drafts"
  on public.booking_drafts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.save_booking_draft(
  p_fcm_token text,
  p_slot timestamptz,
  p_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fcm_token is null or length(trim(p_fcm_token)) = 0 then
    raise exception 'fcm_token is required';
  end if;

  insert into public.booking_drafts (fcm_token, selected_slot, service_summary, updated_at, reminded_at)
  values (p_fcm_token, p_slot, p_summary, now(), null)
  on conflict (fcm_token) do update
    set selected_slot = excluded.selected_slot,
        service_summary = excluded.service_summary,
        updated_at = now(),
        reminded_at = null;
end;
$$;

revoke all on function public.save_booking_draft(text, timestamptz, jsonb) from public;
grant execute on function public.save_booking_draft(text, timestamptz, jsonb) to anon, authenticated;

create or replace function public.clear_booking_draft(p_fcm_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.booking_drafts where fcm_token = p_fcm_token;
end;
$$;

revoke all on function public.clear_booking_draft(text) from public;
grant execute on function public.clear_booking_draft(text) to anon, authenticated;

-- 2. Trigger function called by the scheduled job ---------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_cart_abandonment_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-cart-abandonment-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('triggered_at', now())
  );
end;
$$;

-- 3. Scheduled job (every 5 minutes) ----------------------------------------

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'bubblyfi-cart-abandonment-check';
exception when others then
  null; -- pg_cron not enabled yet, or no prior job — fine, the schedule call below creates it.
end $$;

select cron.schedule(
  'bubblyfi-cart-abandonment-check',
  '*/5 * * * *',
  $$select public.trigger_cart_abandonment_check();$$
);
