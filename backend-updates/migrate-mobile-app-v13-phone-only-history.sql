-- Bubbly-fi Customer v1.6.12: phone-only order history and phone-scoped push registration.
-- Customers enter one phone number to retrieve every matching booking and link this device
-- to status/rider notifications for existing and future bookings using the same phone.

begin;

create or replace function public.bubblyfi_phone_key(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when char_length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 10
      then right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)
    else null
  end
$$;

create table if not exists public.customer_phone_devices (
  id uuid primary key default gen_random_uuid(),
  phone_key text not null,
  fcm_token text not null,
  app_version text,
  area text not null default 'unknown',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_phone_devices_phone_key_check check (phone_key ~ '^[0-9]{10}$'),
  constraint customer_phone_devices_token_length_check check (char_length(fcm_token) between 40 and 4096),
  constraint customer_phone_devices_area_check check (area in ('cubao', 'mplace', 'outside', 'unknown')),
  unique (phone_key, fcm_token)
);

create index if not exists customer_phone_devices_phone_idx
  on public.customer_phone_devices(phone_key)
  where enabled;

alter table public.customer_phone_devices enable row level security;
revoke all on public.customer_phone_devices from anon, authenticated;

create or replace function public.register_customer_phone_device(
  p_phone text,
  p_fcm_token text,
  p_app_version text default null,
  p_area text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_key text := public.bubblyfi_phone_key(p_phone);
  v_token text := trim(coalesce(p_fcm_token, ''));
  v_area text := lower(trim(coalesce(p_area, 'unknown')));
  v_order_count integer := 0;
begin
  if v_phone_key is null then
    raise exception 'Enter a valid phone number';
  end if;
  if char_length(v_token) not between 40 and 4096 then
    raise exception 'Notification token is not available. Allow notifications and reopen the app.';
  end if;
  if v_area not in ('cubao', 'mplace', 'outside', 'unknown') then
    v_area := 'unknown';
  end if;

  insert into public.customer_phone_devices(
    phone_key, fcm_token, app_version, area, enabled, last_seen_at
  ) values (
    v_phone_key, v_token, nullif(trim(coalesce(p_app_version, '')), ''), v_area, true, now()
  )
  on conflict (phone_key, fcm_token) do update
    set app_version = excluded.app_version,
        area = excluded.area,
        enabled = true,
        last_seen_at = now();

  insert into public.customer_device_tokens(
    request_id, fcm_token, app_version, area, enabled, last_seen_at
  )
  select
    request.id,
    v_token,
    nullif(trim(coalesce(p_app_version, '')), ''),
    case
      when lower(trim(coalesce(request.place, ''))) in ('cubao', 'mplace', 'outside')
        then lower(trim(request.place))
      else v_area
    end,
    true,
    now()
  from public.customer_order_requests request
  where public.bubblyfi_phone_key(request.phone) = v_phone_key
  on conflict (request_id, fcm_token) do update
    set app_version = excluded.app_version,
        area = excluded.area,
        enabled = true,
        last_seen_at = now();

  get diagnostics v_order_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'phone_key', v_phone_key,
    'linked_order_count', v_order_count,
    'notifications_registered', true
  );
end;
$$;

revoke all on function public.register_customer_phone_device(text, text, text, text) from public;
grant execute on function public.register_customer_phone_device(text, text, text, text) to anon, authenticated;

create or replace function public.attach_phone_devices_to_customer_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_key text := public.bubblyfi_phone_key(new.phone);
begin
  if v_phone_key is null then
    return new;
  end if;

  insert into public.customer_device_tokens(
    request_id, fcm_token, app_version, area, enabled, last_seen_at
  )
  select
    new.id,
    device.fcm_token,
    device.app_version,
    case
      when lower(trim(coalesce(new.place, ''))) in ('cubao', 'mplace', 'outside')
        then lower(trim(new.place))
      else device.area
    end,
    true,
    now()
  from public.customer_phone_devices device
  where device.phone_key = v_phone_key
    and device.enabled
  on conflict (request_id, fcm_token) do update
    set app_version = excluded.app_version,
        area = excluded.area,
        enabled = true,
        last_seen_at = now();

  return new;
end;
$$;

drop trigger if exists customer_request_attach_phone_devices on public.customer_order_requests;
create trigger customer_request_attach_phone_devices
after insert or update of phone on public.customer_order_requests
for each row execute function public.attach_phone_devices_to_customer_request();

create or replace function public.get_customer_orders_by_phone(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_key text := public.bubblyfi_phone_key(p_phone);
  v_orders jsonb := '[]'::jsonb;
  v_masked text;
begin
  if v_phone_key is null then
    raise exception 'Enter a valid phone number';
  end if;

  select coalesce(jsonb_agg(result.order_json order by result.sort_at desc), '[]'::jsonb)
    into v_orders
  from (
    select
      request.created_at as sort_at,
      jsonb_build_object(
        'request_id', request.id,
        'request_no', request.request_no,
        'order_id', order_row.order_json->>'id',
        'receipt_no', order_row.order_json->>'receipt_no',
        'customer_name', coalesce(order_row.order_json->>'customer_name', request_data.request_json->>'customer_name', request_data.request_json->>'name'),
        'current_status', coalesce(order_row.order_json->>'status', request.status, 'Pending'),
        'current_message', public.bubblyfi_customer_status_message(coalesce(order_row.order_json->>'status', request.status, 'Pending')),
        'created_at', request.created_at,
        'updated_at', coalesce(order_row.order_json->>'updated_at', request_data.request_json->>'updated_at', request.created_at::text),
        'pickup_at', request_data.request_json->>'pickup_at',
        'service', coalesce(order_row.order_json->>'service', order_row.order_json->>'service_type', request_data.request_json->>'service', request_data.request_json->>'service_type'),
        'item_type', coalesce(order_row.order_json->>'item_type', request_data.request_json->>'item_type'),
        'weight', coalesce(order_row.order_json->'weight', request_data.request_json->'weight', request_data.request_json->'estimated_weight'),
        'loads', coalesce(order_row.order_json->'loads', request_data.request_json->'loads', request_data.request_json->'quantity'),
        'total', coalesce(order_row.order_json->'total', request_data.request_json->'total', to_jsonb(0)),
        'place', request_data.request_json->>'place',
        'address', request_data.request_json->>'address',
        'delivery_requested', coalesce(request_data.request_json->'delivery_requested', to_jsonb(false)),
        'payment_method', coalesce(order_row.order_json->>'payment_method', request_data.request_json->>'payment_method', request_data.request_json->>'payment_type'),
        'notes', coalesce(order_row.order_json->>'notes', request_data.request_json->>'notes'),
        'assigned_rider_name', order_row.order_json->>'assigned_rider_name',
        'assigned_rider_phone', order_row.order_json->>'assigned_rider_phone',
        'delivery_eta', order_row.order_json->>'delivery_eta',
        'delivery_proof_type', order_row.order_json->>'delivery_proof_type',
        'delivery_received_at', order_row.order_json->>'delivery_received_at',
        'history', coalesce(history_row.history, jsonb_build_array(
          jsonb_build_object(
            'status', coalesce(order_row.order_json->>'status', request.status, 'Pending'),
            'message', public.bubblyfi_customer_status_message(coalesce(order_row.order_json->>'status', request.status, 'Pending')),
            'created_at', request.created_at
          )
        ))
      ) as order_json
    from public.customer_order_requests request
    cross join lateral (select to_jsonb(request) as request_json) request_data
    left join lateral (
      select to_jsonb(linked_order) as order_json
      from public.orders linked_order
      where linked_order.id = request.converted_order_id
         or linked_order.source_request_id = request.id
      order by linked_order.created_at desc nulls last
      limit 1
    ) order_row on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'status', history.status,
          'message', history.message,
          'created_at', history.created_at
        ) order by history.created_at asc
      ) as history
      from public.customer_status_history history
      where history.request_id = request.id
    ) history_row on true
    where public.bubblyfi_phone_key(request.phone) = v_phone_key
  ) result;

  v_masked := '******' || right(v_phone_key, 4);
  return jsonb_build_object(
    'ok', true,
    'phone_masked', v_masked,
    'count', jsonb_array_length(v_orders),
    'orders', v_orders
  );
end;
$$;

revoke all on function public.get_customer_orders_by_phone(text) from public;
grant execute on function public.get_customer_orders_by_phone(text) to anon, authenticated;

insert into public.customer_device_tokens(
  request_id, fcm_token, app_version, area, enabled, last_seen_at
)
select
  request.id,
  device.fcm_token,
  device.app_version,
  case
    when lower(trim(coalesce(request.place, ''))) in ('cubao', 'mplace', 'outside')
      then lower(trim(request.place))
    else device.area
  end,
  true,
  now()
from public.customer_order_requests request
join public.customer_phone_devices device
  on device.phone_key = public.bubblyfi_phone_key(request.phone)
 and device.enabled
on conflict (request_id, fcm_token) do update
  set app_version = excluded.app_version,
      area = excluded.area,
      enabled = true,
      last_seen_at = now();

commit;
