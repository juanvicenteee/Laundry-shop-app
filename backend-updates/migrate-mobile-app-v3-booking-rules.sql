-- Bubbly-fi mobile apps — configurable geofencing + business hours
--
-- Previously the Cubao/MPlace service-area radii were hardcoded inside
-- determine_bubblyfi_service_area() (and duplicated client-side in every
-- JS bundle), and there was no business-hours or same-day-cutoff
-- enforcement at all beyond "pickup time can't be in the past."
--
-- This migration adds:
--   1. service_areas — an admin-editable table of geofence zones,
--      seeded with the existing MPlace (500m) / Cubao (3500m) values.
--   2. determine_bubblyfi_service_area(...) refactored to read from
--      service_areas instead of hardcoded constants (tightest radius
--      wins, matching the previous MPlace-checked-before-Cubao order).
--   3. New settings columns: booking_open_time, booking_close_time,
--      booking_days_mask (bitmask, Monday=bit0..Sunday=bit6),
--      same_day_cutoff_time. get_public_booking_options() already
--      returns `to_jsonb(settings)`, so these surface to the customer
--      app with no further change there.
--   4. submit_customer_order(...) gains a guard that rejects bookings
--      outside business hours/days, and rejects same-day pickup
--      requests submitted after the cutoff.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw,
-- after v1 and v2. Nothing here deletes or alters existing rows.

-- 1. Configurable geofence zones ----------------------------------------------

create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  center_lat numeric(10,7) not null,
  center_lng numeric(10,7) not null,
  radius_m numeric not null check (radius_m > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_areas (name, code, center_lat, center_lng, radius_m)
values
  ('MPlace', 'mplace', 14.6389788, 121.0334650, 500),
  ('Cubao', 'cubao', 14.6175619, 121.0598714, 3500)
on conflict (code) do nothing;

alter table public.service_areas enable row level security;

drop policy if exists "Anyone can read active service areas" on public.service_areas;
create policy "Anyone can read active service areas"
  on public.service_areas
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff manage service areas" on public.service_areas;
create policy "Staff manage service areas"
  on public.service_areas
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Was `immutable` when the radii were hardcoded; now reads a table, so it
-- must be `stable` (still safe to use inside index/trigger contexts, just
-- no longer eligible for constant-folding).
create or replace function public.determine_bubblyfi_service_area(
  p_lat numeric,
  p_lng numeric
)
returns text
language plpgsql
stable
strict
set search_path = public
as $$
declare
  v_code text;
begin
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid GPS coordinates';
  end if;

  select code into v_code
  from public.service_areas
  where is_active
    and public.bubblyfi_distance_meters(p_lat, p_lng, center_lat, center_lng) <= radius_m
  order by radius_m asc
  limit 1;

  return coalesce(v_code, 'outside');
end;
$$;

comment on function public.determine_bubblyfi_service_area(numeric, numeric) is
  'Business pricing geofence: reads public.service_areas (tightest radius wins); otherwise outside.';

-- 2. Business hours + same-day cutoff -----------------------------------------

alter table public.settings
  add column if not exists booking_open_time time not null default '07:30',
  add column if not exists booking_close_time time not null default '19:30',
  add column if not exists booking_days_mask smallint not null default 127, -- Mon=bit0 .. Sun=bit6, 127 = every day
  add column if not exists same_day_cutoff_time time not null default '15:00';

create or replace function public.get_public_booking_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'settings', to_jsonb(s) - 'updated_by' - 'updated_at',
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'category', i.category,
        'price', coalesce(i.customer_price_per_load,
          case when lower(i.category) = 'detergent' then s.default_detergent_price else s.default_conditioner_price end, 0)
      ) order by i.category, i.name)
      from public.inventory i
      where i.is_active is not false
        and i.stock > 0
        and lower(i.category) in ('detergent','fabric conditioner')
    ), '[]'::jsonb),
    'service_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', a.code, 'name', a.name, 'center_lat', a.center_lat, 'center_lng', a.center_lng, 'radius_m', a.radius_m
      ) order by a.radius_m)
      from public.service_areas a
      where a.is_active
    ), '[]'::jsonb)
  )
  from public.settings s where s.id = 1;
$$;

-- 3. submit_customer_order gains a business-hours / same-day-cutoff guard ----
-- (full body reproduced from migrate-v2.6.2-phone-email-notifications.sql,
-- with the guard added at the top; everything after it is unchanged)

create or replace function public.submit_customer_order(p_payload jsonb)
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
begin
  select booking_open_time, booking_close_time, booking_days_mask, same_day_cutoff_time
  into v_settings
  from public.settings where id = 1;

  v_dow := extract(isodow from v_now_ph)::int; -- 1=Monday .. 7=Sunday
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

  return jsonb_build_object('id',r.id,'request_no',r.request_no,'total',r.total,'delivery_fee',r.delivery_fee,'status',r.status);
end;
$$;

grant execute on function public.submit_customer_order(jsonb) to anon, authenticated;
