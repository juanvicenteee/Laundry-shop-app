-- Bubbly-fi mobile apps — referral codes + first-order discount
--
-- One unified "coupon or referral code" field, checked via
-- check_coupon(code, phone) and applied inside submit_customer_order via
-- a new optional p_coupon_code parameter. Three kinds of code, all typed
-- into the same input:
--   1. 'BUBBLYNEW' — global, 10% off, valid only for a phone's first
--      booking (no prior non-rejected customer_order_requests row).
--   2. A referral code (public.referral_codes, one per customer,
--      auto-generated via get_or_create_referral_code) — also 10% off,
--      also first-booking-only, and additionally issues the referrer a
--      ₱50 flat coupon once the referred customer's booking is
--      submitted (not merely when the code is entered — this ties the
--      reward to an actual completed booking, matching "user B
--      completes their first booking").
--   3. A personal coupon (public.coupons) — e.g. the ₱50 referral
--      reward — flat or percent, single-use, owner-phone-scoped.
--
-- The discount is applied as an UPDATE after the insert (which already
-- ran the existing pricing trigger and populated `total`), rather than
-- inside the pricing trigger itself — this migration doesn't touch that
-- trigger at all, since its exact logic isn't something we should guess
-- at and risk breaking.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1, v2, and v3 (this replaces submit_customer_order again, this
-- time adding a trailing p_coupon_code parameter on top of the v3
-- version's business-hours guard).

-- 1. Schema -----------------------------------------------------------------

alter table public.customer_order_requests
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric not null default 0;

create table if not exists public.referral_codes (
  code text primary key,
  owner_phone text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
drop policy if exists "No direct access to referral_codes" on public.referral_codes;
create policy "No direct access to referral_codes"
  on public.referral_codes for all to anon, authenticated using (false) with check (false);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('flat', 'percent')),
  amount numeric not null check (amount > 0),
  owner_phone text not null,
  is_redeemed boolean not null default false,
  redeemed_order_id uuid references public.customer_order_requests(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists coupons_owner_phone_idx on public.coupons(owner_phone);

alter table public.coupons enable row level security;
drop policy if exists "No direct access to coupons" on public.coupons;
create policy "No direct access to coupons"
  on public.coupons for all to anon, authenticated using (false) with check (false);

-- 2. Referral code generation -------------------------------------------------

create or replace function public.get_or_create_referral_code(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  v_code text;
begin
  normalized := public.normalize_ph_mobile(p_phone);
  if normalized is null then
    raise exception using errcode = '22023', message = 'Invalid Philippine mobile number.';
  end if;

  select code into v_code from public.referral_codes where owner_phone = normalized;
  if v_code is not null then
    return v_code;
  end if;

  v_code := 'BFI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.referral_codes (code, owner_phone) values (v_code, normalized);
  return v_code;
end;
$$;

revoke all on function public.get_or_create_referral_code(text) from public;
grant execute on function public.get_or_create_referral_code(text) to anon, authenticated;

-- 3. Coupon/referral code preview (used by the client before submit) --------

create or replace function public.check_coupon(p_code text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_phone text;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_coupon record;
  v_referral record;
  v_has_prior boolean;
begin
  normalized_phone := public.normalize_ph_mobile(p_phone);
  if normalized_phone is null then
    return jsonb_build_object('valid', false, 'message', 'Enter your mobile number first.');
  end if;
  if v_code = '' then
    return jsonb_build_object('valid', false, 'message', 'Enter a code.');
  end if;

  select exists(
    select 1 from public.customer_order_requests
    where phone = normalized_phone and status <> 'Rejected'
  ) into v_has_prior;

  if v_code = 'BUBBLYNEW' then
    if v_has_prior then
      return jsonb_build_object('valid', false, 'message', 'BUBBLYNEW is only valid for your first booking.');
    end if;
    return jsonb_build_object('valid', true, 'kind', 'percent', 'amount', 10, 'message', '10% off your first booking!');
  end if;

  select * into v_referral from public.referral_codes where code = v_code;
  if found then
    if v_referral.owner_phone = normalized_phone then
      return jsonb_build_object('valid', false, 'message', 'You cannot use your own referral code.');
    end if;
    if v_has_prior then
      return jsonb_build_object('valid', false, 'message', 'Referral codes are only valid for your first booking.');
    end if;
    return jsonb_build_object('valid', true, 'kind', 'percent', 'amount', 10, 'message', '10% off your first booking (referral)!');
  end if;

  select * into v_coupon from public.coupons
  where code = v_code and owner_phone = normalized_phone and not is_redeemed
    and (expires_at is null or expires_at > now());
  if found then
    return jsonb_build_object(
      'valid', true, 'kind', v_coupon.kind, 'amount', v_coupon.amount,
      'message', case when v_coupon.kind = 'percent' then v_coupon.amount::text || '% off!' else '₱' || v_coupon.amount::text || ' off!' end
    );
  end if;

  return jsonb_build_object('valid', false, 'message', 'This code is invalid, already used, or expired.');
end;
$$;

revoke all on function public.check_coupon(text, text) from public;
grant execute on function public.check_coupon(text, text) to anon, authenticated;

-- 4. submit_customer_order gains p_coupon_code -------------------------------
-- (full body reproduced from migrate-mobile-app-v3-booking-rules.sql, with
-- the coupon/referral application block added after the insert)

create or replace function public.submit_customer_order(p_payload jsonb, p_coupon_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.customer_order_requests%rowtype;
  request_number text;
  request_uuid uuid := gen_random_uuid();
  normalized_phone text;
  v_settings record;
  v_now_ph timestamptz := now() at time zone 'Asia/Manila';
  v_dow int;
  v_pickup timestamptz;
  v_check jsonb;
  v_discount numeric := 0;
  v_code text;
begin
  select booking_open_time, booking_close_time, booking_days_mask, same_day_cutoff_time
  into v_settings
  from public.settings where id = 1;

  v_dow := extract(isodow from v_now_ph)::int;
  if (v_settings.booking_days_mask & (1 << (v_dow - 1))) = 0 then
    raise exception 'Bubbly-fi is not accepting bookings today. Please check our operating days.';
  end if;

  if v_now_ph::time < v_settings.booking_open_time or v_now_ph::time > v_settings.booking_close_time then
    raise exception 'Bookings are only accepted between % and % (Asia/Manila time).',
      to_char(v_settings.booking_open_time, 'HH12:MI AM'), to_char(v_settings.booking_close_time, 'HH12:MI AM');
  end if;

  v_pickup := nullif(p_payload->>'pickup_at', '')::timestamptz;
  if v_pickup is not null
     and (v_pickup at time zone 'Asia/Manila')::date = v_now_ph::date
     and v_now_ph::time > v_settings.same_day_cutoff_time
  then
    raise exception 'Same-day pickup is no longer available today (cutoff was %). Please choose a next-day pickup time.',
      to_char(v_settings.same_day_cutoff_time, 'HH12:MI AM');
  end if;

  if nullif(trim(p_payload->>'customer_name'),'') is null then
    raise exception 'Customer name is required';
  end if;

  normalized_phone := public.normalize_ph_mobile(p_payload->>'phone');
  if normalized_phone is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid Philippine mobile number. Use 09XXXXXXXXX or +639XXXXXXXXX.';
  end if;

  request_number := 'BFQ-' || to_char(now() at time zone 'Asia/Manila','YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(request_uuid::text,'-',''),1,4));

  insert into public.customer_order_requests(
    id,request_no,customer_name,phone,email,service_type,item_type,full_service,quantity,unit,place,
    detergent_source,detergent_item_id,conditioner_source,conditioner_item_id,
    extra_dry,extra_wash,warm_hot_wash,zonrox_colorsafe,extra_detergent,extra_conditioner,
    delivery_requested,address_line,building_unit,barangay,city,landmark,full_address,
    gps_lat,gps_lng,maps_url,pickup_at,item_description,item_count,bags_count,
    pickup_photo_path,item_photo_paths,payment_reference,payment_proof_path,customer_notes
  ) values (
    request_uuid,request_number,trim(p_payload->>'customer_name'),normalized_phone,nullif(trim(p_payload->>'email'),''),
    p_payload->>'service_type',coalesce(nullif(p_payload->>'item_type',''),'assorted_clothes'),coalesce((p_payload->>'full_service')::boolean,false),
    greatest(coalesce((p_payload->>'quantity')::numeric,1),.5),coalesce(nullif(p_payload->>'unit',''),'kg'),p_payload->>'place',
    p_payload->>'detergent_source',nullif(p_payload->>'detergent_item_id','')::uuid,p_payload->>'conditioner_source',nullif(p_payload->>'conditioner_item_id','')::uuid,
    coalesce((p_payload->>'extra_dry')::boolean,false),coalesce((p_payload->>'extra_wash')::boolean,false),coalesce((p_payload->>'warm_hot_wash')::boolean,false),
    coalesce((p_payload->>'zonrox_colorsafe')::boolean,false),coalesce((p_payload->>'extra_detergent')::boolean,false),coalesce((p_payload->>'extra_conditioner')::boolean,false),
    coalesce((p_payload->>'delivery_requested')::boolean,true),trim(p_payload->>'address_line'),trim(p_payload->>'building_unit'),trim(p_payload->>'barangay'),trim(p_payload->>'city'),trim(p_payload->>'landmark'),trim(p_payload->>'full_address'),
    nullif(p_payload->>'gps_lat','')::numeric,nullif(p_payload->>'gps_lng','')::numeric,p_payload->>'maps_url',nullif(p_payload->>'pickup_at','')::timestamptz,
    trim(p_payload->>'item_description'),nullif(p_payload->>'item_count','')::integer,nullif(p_payload->>'bags_count','')::integer,
    p_payload->>'pickup_photo_path',coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'item_photo_paths','[]'::jsonb))),array[]::text[]),
    trim(p_payload->>'payment_reference'),p_payload->>'payment_proof_path',trim(p_payload->>'customer_notes')
  ) returning * into r;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    v_code := upper(trim(p_coupon_code));
    v_check := public.check_coupon(v_code, normalized_phone);

    if (v_check->>'valid')::boolean then
      v_discount := case
        when v_check->>'kind' = 'percent' then round(r.total * (v_check->>'amount')::numeric / 100, 2)
        else least((v_check->>'amount')::numeric, r.total)
      end;

      update public.customer_order_requests
      set coupon_code = v_code, discount_amount = v_discount, total = greatest(0, total - v_discount)
      where id = r.id
      returning * into r;

      -- Personal coupon (referral reward or otherwise): mark redeemed.
      update public.coupons
      set is_redeemed = true, redeemed_order_id = r.id
      where code = v_code and owner_phone = normalized_phone and not is_redeemed;

      -- Referral code: reward the referrer now that the referred
      -- customer's first booking has actually been submitted.
      insert into public.coupons (code, kind, amount, owner_phone)
      select 'REF50-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), 'flat', 50, rc.owner_phone
      from public.referral_codes rc
      where rc.code = v_code;
    end if;
  end if;

  return jsonb_build_object(
    'id', r.id, 'request_no', r.request_no, 'total', r.total, 'delivery_fee', r.delivery_fee,
    'status', r.status, 'discount_amount', r.discount_amount
  );
end;
$$;

grant execute on function public.submit_customer_order(jsonb, text) to anon, authenticated;
