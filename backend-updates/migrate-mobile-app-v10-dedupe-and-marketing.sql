-- Bubbly-fi — dedupe guard logic + build the missing marketing send path
--
-- Part of the reconciliation between my earlier migrations (v1-v3, live)
-- and the pre-existing ChatGPT-built backend (customer_profiles,
-- customer_addresses, customer_wash_preferences, device_push_tokens,
-- notification_preferences, booking_carts, coupons/customer_coupons/
-- referral_events, mobile_app_settings, apply_mobile_booking_discount,
-- mobile_request_guard, etc. — see backend-updates/README.md for the full
-- "do not run v4-v8" explanation).
--
-- 1. mobile_request_guard() currently duplicates business-hours/same-day
--    enforcement that submit_customer_order() already does (reading a
--    DIFFERENT settings table — mobile_app_settings vs settings — which
--    the ops app's Controls page only ever edits one of). It also
--    classifies area from pin_lat/pin_lng via classify_bubblyfi_area(),
--    columns nothing writes to (the client only ever populates gps_lat/
--    gps_lng, which the separate, pricing-critical
--    customer_request_area_from_gps trigger already classifies correctly
--    via determine_bubblyfi_service_area() + the service_areas table).
--    This migration simplifies mobile_request_guard() to just the one
--    thing it does that's NOT duplicated anywhere else: enforcing
--    mobile_app_settings.allow_outside (a toggle with no UI anywhere
--    yet — added to the ops Controls page as part of this reconciliation).
--
-- 2. marketing_campaigns exists but nothing anywhere (SQL or Edge
--    Function) ever sends anything — it was scaffolded but never wired
--    up. This adds count_marketing_recipients()/broadcast_marketing()
--    RPCs targeting the real device_push_tokens/notification_preferences
--    tables, paired with a new send-marketing-broadcast Edge Function
--    (reusing the FCM-sending helper already extracted to
--    supabase/functions/_shared/fcm.ts in v6).
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v9.

-- 1. Simplify mobile_request_guard() ------------------------------------

create or replace function public.mobile_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  s public.mobile_app_settings%rowtype;
  calculated_area text;
begin
  select * into s from public.mobile_app_settings where id = 1;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  -- Hours/same-day-cutoff enforcement lives solely in
  -- submit_customer_order() (reading public.settings, which the ops app's
  -- Controls page actually edits) — removed here to avoid two
  -- independently-editable config tables enforcing the same rule.
  -- Area classification lives solely in the pre-existing
  -- customer_request_area_from_gps trigger (reading gps_lat/gps_lng via
  -- determine_bubblyfi_service_area(), which the client actually
  -- populates) — removed here too. The one thing this trigger still
  -- uniquely does: block outside-Cubao bookings entirely when the admin
  -- has disabled them.
  if new.gps_lat is not null and new.gps_lng is not null then
    calculated_area := public.determine_bubblyfi_service_area(new.gps_lat, new.gps_lng);
    if calculated_area = 'outside' and not coalesce(s.allow_outside, true) then
      raise exception 'Outside Cubao bookings are currently disabled';
    end if;
  end if;

  return new;
end;
$function$;

-- 2. Marketing broadcast — count + send RPCs -----------------------------

create or replace function public.count_marketing_recipients(p_area text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.device_push_tokens t
  join public.notification_preferences n on n.user_id = t.user_id
  where t.app_role = 'customer'
    and t.active
    and n.marketing
    and (p_area = 'all' or t.area = p_area);
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
  v_campaign_id uuid;
begin
  if not public.is_bubblyfi_admin() then
    raise exception 'Only staff can send marketing broadcasts';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_body), '') is null then
    raise exception 'Title and body are required';
  end if;

  v_count := public.count_marketing_recipients(p_area);

  insert into public.marketing_campaigns (title, body, target_area, sent_by, recipient_count)
  values (p_title, p_body, p_area, auth.uid(), v_count)
  returning id into v_campaign_id;

  perform net.http_post(
    url := 'https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-marketing-broadcast',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('campaign_id', v_campaign_id)
  );

  return jsonb_build_object('ok', true, 'campaign_id', v_campaign_id, 'recipient_count', v_count);
end;
$$;

revoke all on function public.broadcast_marketing(text, text, text) from public;
grant execute on function public.broadcast_marketing(text, text, text) to authenticated;
