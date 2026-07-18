-- Bubbly-fi guest customer push, complete status history, and rider alerts.
-- Additive migration for project amjhrejmcnthlrqddznw.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;

alter table public.customer_order_requests
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();
create unique index if not exists customer_order_requests_tracking_token_uidx on public.customer_order_requests(tracking_token);

create table if not exists public.customer_installations (
  installation_id uuid primary key,
  fcm_token text not null unique,
  app_version text,
  area text not null default 'unknown',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_installations_area_check check (area in ('cubao','mplace','outside','unknown')),
  constraint customer_installations_token_length_check check (char_length(fcm_token) between 40 and 4096)
);
create index if not exists customer_installations_area_idx on public.customer_installations(area) where enabled;

create table if not exists public.customer_device_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_order_requests(id) on delete cascade,
  fcm_token text not null,
  platform text not null default 'android',
  app_version text,
  area text not null default 'unknown',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_device_tokens_area_check check (area in ('cubao','mplace','outside','unknown')),
  constraint customer_device_tokens_token_length_check check (char_length(fcm_token) between 40 and 4096),
  unique(request_id, fcm_token)
);
create index if not exists customer_device_tokens_request_idx on public.customer_device_tokens(request_id) where enabled;
create index if not exists customer_device_tokens_area_idx on public.customer_device_tokens(area) where enabled;
create index if not exists customer_device_tokens_fcm_idx on public.customer_device_tokens(fcm_token) where enabled;

create table if not exists public.customer_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_order_requests(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  status text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists customer_status_history_request_idx on public.customer_status_history(request_id, created_at desc);

alter table public.customer_installations enable row level security;
alter table public.customer_device_tokens enable row level security;
alter table public.customer_status_history enable row level security;
revoke all on public.customer_installations from anon, authenticated;
revoke all on public.customer_device_tokens from anon, authenticated;
revoke all on public.customer_status_history from anon, authenticated;

create or replace function public.bubblyfi_customer_status_message(p_status text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(p_status,'')))
    when 'pending' then 'Your booking was received and is waiting for confirmation.'
    when 'received' then 'Your laundry order was received by Bubbly-fi.'
    when 'confirmed' then 'Your booking has been confirmed.'
    when 'scheduled' then 'Your pickup schedule has been confirmed.'
    when 'for pickup' then 'Your laundry is scheduled for pickup.'
    when 'rider assigned' then 'A delivery staff member has been assigned to your order.'
    when 'on the way' then 'Your delivery staff is on the way. Please be ready.'
    when 'rider on the way' then 'Your delivery staff is on the way. Please be ready.'
    when 'rider approaching' then 'Your delivery staff is approaching your pickup or delivery point.'
    when 'nearby' then 'Your delivery staff is nearby. Please be ready.'
    when 'picked up' then 'Your laundry has been picked up.'
    when 'pickup complete' then 'Your laundry has arrived at the shop.'
    when 'washing' then 'Your laundry is being washed.'
    when 'drying' then 'Your laundry is being dried.'
    when 'folding' then 'Your laundry is being folded.'
    when 'processing' then 'Your laundry is being processed.'
    when 'ready' then 'Your laundry is ready.'
    when 'ready for pickup' then 'Your laundry is ready for pickup.'
    when 'out for delivery' then 'Your laundry is out for delivery.'
    when 'delivered' then 'Your laundry has been delivered.'
    when 'claimed' then 'Your laundry has been claimed. Thank you for choosing Bubbly-fi.'
    when 'completed' then 'Your laundry order has been completed.'
    when 'cancelled' then 'Your laundry order was cancelled.'
    when 'rejected' then 'The booking could not be accepted. Contact Bubbly-fi for details.'
    else 'Your laundry order status is now ' || coalesce(nullif(trim(p_status),''),'Updated') || '.'
  end
$$;

create or replace function public.register_customer_installation(
  p_installation_id uuid, p_fcm_token text, p_app_version text default null, p_area text default 'unknown'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_token text:=trim(coalesce(p_fcm_token,'')); v_area text:=lower(trim(coalesce(p_area,'unknown')));
begin
  if p_installation_id is null then raise exception 'Installation ID is required'; end if;
  if char_length(v_token) not between 40 and 4096 then raise exception 'Invalid Firebase device token'; end if;
  if v_area not in ('cubao','mplace','outside','unknown') then v_area:='unknown'; end if;
  delete from public.customer_installations where installation_id=p_installation_id and fcm_token<>v_token;
  insert into public.customer_installations(installation_id,fcm_token,app_version,area,enabled,last_seen_at)
  values(p_installation_id,v_token,nullif(trim(coalesce(p_app_version,'')),''),v_area,true,now())
  on conflict(fcm_token) do update set installation_id=excluded.installation_id,app_version=excluded.app_version,area=excluded.area,enabled=true,last_seen_at=now();
  return jsonb_build_object('ok',true,'area',v_area,'registered',true);
end;$$;
revoke all on function public.register_customer_installation(uuid,text,text,text) from public;
grant execute on function public.register_customer_installation(uuid,text,text,text) to anon,authenticated;

create or replace function public.register_customer_device(
  p_request_id uuid,p_request_no text,p_phone text,p_fcm_token text default null,p_app_version text default null,p_area text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.customer_order_requests%rowtype; v_token text:=nullif(trim(coalesce(p_fcm_token,'')),''); v_area text:=lower(trim(coalesce(p_area,'unknown'))); v_order_id uuid; v_order_status text;
begin
  if char_length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))<10 then raise exception 'Invalid booking registration details'; end if;
  select * into r from public.customer_order_requests
  where id=p_request_id and request_no=trim(p_request_no)
    and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10);
  if not found then raise exception 'Invalid booking registration details'; end if;
  if v_area not in ('cubao','mplace','outside','unknown') then v_area:='unknown'; end if;
  if v_token is not null then
    if char_length(v_token) not between 40 and 4096 then raise exception 'Invalid Firebase device token'; end if;
    insert into public.customer_device_tokens(request_id,fcm_token,app_version,area,enabled,last_seen_at)
    values(r.id,v_token,nullif(trim(coalesce(p_app_version,'')),''),v_area,true,now())
    on conflict(request_id,fcm_token) do update set app_version=excluded.app_version,area=excluded.area,enabled=true,last_seen_at=now();
  end if;
  select id,status into v_order_id,v_order_status from public.orders
  where id=r.converted_order_id or source_request_id=r.id order by created_at desc nulls last limit 1;
  if not exists(select 1 from public.customer_status_history where request_id=r.id) then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(r.id,v_order_id,coalesce(v_order_status,r.status,'Pending'),public.bubblyfi_customer_status_message(coalesce(v_order_status,r.status,'Pending')),coalesce(r.created_at,now()));
  end if;
  return jsonb_build_object('ok',true,'request_id',r.id,'request_no',r.request_no,'tracking_token',r.tracking_token,'status',coalesce(v_order_status,r.status,'Pending'),'order_id',v_order_id,'notifications_registered',v_token is not null);
end;$$;
revoke all on function public.register_customer_device(uuid,text,text,text,text,text) from public;
grant execute on function public.register_customer_device(uuid,text,text,text,text,text) to anon,authenticated;

create or replace function public.get_customer_tracking(p_request_no text,p_tracking_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.customer_order_requests%rowtype; o public.orders%rowtype; rj jsonb; oj jsonb; v_status text; v_history jsonb;
begin
  select * into r from public.customer_order_requests where request_no=trim(p_request_no) and tracking_token=p_tracking_token;
  if not found then raise exception 'Tracking details were not found'; end if;
  select * into o from public.orders where id=r.converted_order_id or source_request_id=r.id order by created_at desc nulls last limit 1;
  rj:=to_jsonb(r); oj:=case when o.id is null then '{}'::jsonb else to_jsonb(o) end; v_status:=coalesce(oj->>'status',rj->>'status','Pending');
  select coalesce(jsonb_agg(jsonb_build_object('status',h.status,'message',h.message,'created_at',h.created_at) order by h.created_at asc),'[]'::jsonb)
  into v_history from public.customer_status_history h where h.request_id=r.id;
  if v_history='[]'::jsonb then v_history:=jsonb_build_array(jsonb_build_object('status',coalesce(r.status,'Pending'),'message',public.bubblyfi_customer_status_message(coalesce(r.status,'Pending')),'created_at',r.created_at)); end if;
  return jsonb_build_object(
    'request_no',r.request_no,'request_id',r.id,'order_id',o.id,'receipt_no',oj->>'receipt_no','current_status',v_status,
    'current_message',public.bubblyfi_customer_status_message(v_status),'created_at',r.created_at,'pickup_at',rj->>'pickup_at',
    'updated_at',coalesce(oj->>'updated_at',rj->>'updated_at',r.created_at::text),
    'total',coalesce(nullif(oj->>'total','')::numeric,nullif(rj->>'total','')::numeric,0),
    'service',coalesce(oj->>'service',rj->>'service'),'item_type',coalesce(oj->>'item_type',rj->>'item_type'),
    'place',rj->>'place','address',rj->>'address','delivery_requested',coalesce(nullif(rj->>'delivery_requested','')::boolean,false),'history',v_history);
end;$$;
revoke all on function public.get_customer_tracking(text,uuid) from public;
grant execute on function public.get_customer_tracking(text,uuid) to anon,authenticated;

create or replace function public.capture_customer_request_status_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at:=now();
  if tg_op='INSERT' then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.id,new.converted_order_id,coalesce(new.status,'Pending'),public.bubblyfi_customer_status_message(coalesce(new.status,'Pending')),now());
  elsif new.status is distinct from old.status then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.id,new.converted_order_id,coalesce(new.status,'Pending'),public.bubblyfi_customer_status_message(coalesce(new.status,'Pending')),now());
  end if;
  return new;
end;$$;
drop trigger if exists customer_request_status_history on public.customer_order_requests;
create trigger customer_request_status_history before insert or update on public.customer_order_requests for each row execute function public.capture_customer_request_status_history();

create or replace function public.capture_order_status_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at:=now();
  if new.source_request_id is null then return new; end if;
  if tg_op='INSERT' then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.source_request_id,new.id,coalesce(new.status,'Received'),public.bubblyfi_customer_status_message(coalesce(new.status,'Received')),now());
  elsif new.status is distinct from old.status then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.source_request_id,new.id,coalesce(new.status,'Received'),public.bubblyfi_customer_status_message(coalesce(new.status,'Received')),now());
  end if;
  return new;
end;$$;
drop trigger if exists order_status_history on public.orders;
create trigger order_status_history before insert or update on public.orders for each row execute function public.capture_order_status_history();

create or replace function public.notify_customer_request_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  perform net.http_post(
    url:='https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
    headers:=jsonb_build_object('Content-Type','application/json'),
    body:=jsonb_build_object('kind','request_status','request_id',new.id,'status',coalesce(new.status,'Updated'),'dedupe_key','request:'||new.id::text||':'||coalesce(new.updated_at,now())::text));
  return new;
end;$$;
drop trigger if exists customer_request_status_notify on public.customer_order_requests;
create trigger customer_request_status_notify after update of status on public.customer_order_requests for each row execute function public.notify_customer_request_status();

create or replace function public.notify_order_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  perform net.http_post(
    url:='https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
    headers:=jsonb_build_object('Content-Type','application/json'),
    body:=jsonb_build_object('kind','order_status','order_id',new.id,'status',coalesce(new.status,'Updated'),'dedupe_key','order:'||new.id::text||':'||coalesce(new.updated_at,now())::text));
  return new;
end;$$;
drop trigger if exists order_status_notify on public.orders;
create trigger order_status_notify after update of status on public.orders for each row execute function public.notify_order_status();

create or replace function public.notify_rider_approaching(p_order_id uuid,p_rider_lat numeric,p_rider_lng numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request_id uuid; v_pin_lat numeric; v_pin_lng numeric; v_distance numeric;
begin
  if not public.is_staff() then raise exception 'Only staff can send rider-approaching notifications'; end if;
  select r.id,r.gps_lat,r.gps_lng into v_request_id,v_pin_lat,v_pin_lng
  from public.orders o left join public.customer_order_requests r on r.id=o.source_request_id or r.converted_order_id=o.id
  where o.id=p_order_id order by case when r.id=o.source_request_id then 0 else 1 end limit 1;
  if not found then raise exception 'Order not found'; end if;
  if v_pin_lat is not null and v_pin_lng is not null and p_rider_lat is not null and p_rider_lng is not null then
    v_distance:=public.bubblyfi_distance_meters(p_rider_lat,p_rider_lng,v_pin_lat,v_pin_lng);
  end if;
  perform net.http_post(
    url:='https://amjhrejmcnthlrqddznw.supabase.co/functions/v1/send-push-notification',
    headers:=jsonb_build_object('Content-Type','application/json'),
    body:=jsonb_build_object('kind','rider_approaching','order_id',p_order_id,'request_id',v_request_id,'distance_m',v_distance,'dedupe_key','rider:'||p_order_id::text||':'||floor(extract(epoch from clock_timestamp())/60)::bigint::text));
  return jsonb_build_object('ok',true,'request_id',v_request_id,'distance_m',v_distance);
end;$$;
revoke all on function public.notify_rider_approaching(uuid,numeric,numeric) from public;
grant execute on function public.notify_rider_approaching(uuid,numeric,numeric) to authenticated;

do $$
begin
  if to_regclass('public.customer_notifications') is not null then execute 'drop trigger if exists send_customer_push_webhook on public.customer_notifications'; end if;
  if to_regclass('public.marketing_broadcasts') is not null then execute 'drop trigger if exists marketing_broadcast_push_trigger on public.marketing_broadcasts'; end if;
  execute 'drop trigger if exists customer_request_status_tracking_trigger on public.customer_order_requests';
  execute 'drop trigger if exists order_customer_status_tracking_trigger on public.orders';
end $$;

insert into public.customer_status_history(request_id,order_id,status,message,created_at)
select r.id,o.id,coalesce(o.status,r.status,'Pending'),public.bubblyfi_customer_status_message(coalesce(o.status,r.status,'Pending')),coalesce(o.created_at,r.created_at,now())
from public.customer_order_requests r
left join lateral (select x.* from public.orders x where x.id=r.converted_order_id or x.source_request_id=r.id order by x.created_at desc nulls last limit 1) o on true
where not exists(select 1 from public.customer_status_history h where h.request_id=r.id);

commit;
