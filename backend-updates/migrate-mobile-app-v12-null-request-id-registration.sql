-- Customer app v1.6.11 registration fix.
-- Allows the Android app to link a successful booking with request number + phone
-- even when the booking page response does not expose the request UUID.

begin;

create or replace function public.register_customer_device(
  p_request_id uuid,
  p_request_no text,
  p_phone text,
  p_fcm_token text default null,
  p_app_version text default null,
  p_area text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.customer_order_requests%rowtype;
  v_token text := nullif(trim(coalesce(p_fcm_token, '')), '');
  v_area text := lower(trim(coalesce(p_area, 'unknown')));
  v_order_id uuid;
  v_order_status text;
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if trim(coalesce(p_request_no, '')) = '' or char_length(v_phone_digits) < 10 then
    raise exception 'Invalid booking registration details';
  end if;

  select request.*
    into r
  from public.customer_order_requests request
  where request.request_no = trim(p_request_no)
    and (p_request_id is null or request.id = p_request_id)
    and right(regexp_replace(coalesce(request.phone, ''), '[^0-9]', '', 'g'), 10)
        = right(v_phone_digits, 10)
  order by
    case when p_request_id is not null and request.id = p_request_id then 0 else 1 end,
    request.created_at desc
  limit 1;

  if not found then
    raise exception 'Invalid booking registration details';
  end if;

  if v_area not in ('cubao', 'mplace', 'outside', 'unknown') then
    v_area := 'unknown';
  end if;

  if v_token is not null then
    if char_length(v_token) not between 40 and 4096 then
      raise exception 'Invalid Firebase device token';
    end if;

    insert into public.customer_device_tokens(
      request_id,
      fcm_token,
      app_version,
      area,
      enabled,
      last_seen_at
    ) values (
      r.id,
      v_token,
      nullif(trim(coalesce(p_app_version, '')), ''),
      v_area,
      true,
      now()
    )
    on conflict (request_id, fcm_token) do update
      set app_version = excluded.app_version,
          area = excluded.area,
          enabled = true,
          last_seen_at = now();
  end if;

  select orders.id, orders.status
    into v_order_id, v_order_status
  from public.orders
  where orders.id = r.converted_order_id
     or orders.source_request_id = r.id
  order by orders.created_at desc nulls last
  limit 1;

  if not exists (
    select 1
    from public.customer_status_history history
    where history.request_id = r.id
  ) then
    insert into public.customer_status_history(
      request_id,
      order_id,
      status,
      message,
      created_at
    ) values (
      r.id,
      v_order_id,
      coalesce(v_order_status, r.status, 'Pending'),
      public.bubblyfi_customer_status_message(coalesce(v_order_status, r.status, 'Pending')),
      coalesce(r.created_at, now())
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', r.id,
    'request_no', r.request_no,
    'tracking_token', r.tracking_token,
    'status', coalesce(v_order_status, r.status, 'Pending'),
    'order_id', v_order_id,
    'notifications_registered', v_token is not null
  );
end;
$$;

revoke all on function public.register_customer_device(uuid, text, text, text, text, text) from public;
grant execute on function public.register_customer_device(uuid, text, text, text, text, text) to anon, authenticated;

commit;
