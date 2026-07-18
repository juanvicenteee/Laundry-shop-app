-- Correct trigger timing from v11: parent rows must exist before history FK inserts.
begin;

create or replace function public.touch_customer_request_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=now(); return new; end;$$;
drop trigger if exists customer_request_touch_updated_at on public.customer_order_requests;
create trigger customer_request_touch_updated_at before update on public.customer_order_requests
for each row execute function public.touch_customer_request_updated_at();

create or replace function public.capture_customer_request_status_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.id,new.converted_order_id,coalesce(new.status,'Pending'),
      public.bubblyfi_customer_status_message(coalesce(new.status,'Pending')),now());
  end if;
  return new;
end;$$;
drop trigger if exists customer_request_status_history on public.customer_order_requests;
create trigger customer_request_status_history after insert or update on public.customer_order_requests
for each row execute function public.capture_customer_request_status_history();

create or replace function public.touch_order_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=now(); return new; end;$$;
drop trigger if exists order_touch_updated_at on public.orders;
create trigger order_touch_updated_at before update on public.orders
for each row execute function public.touch_order_updated_at();

create or replace function public.capture_order_status_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.source_request_id is not null and (tg_op='INSERT' or new.status is distinct from old.status) then
    insert into public.customer_status_history(request_id,order_id,status,message,created_at)
    values(new.source_request_id,new.id,coalesce(new.status,'Received'),
      public.bubblyfi_customer_status_message(coalesce(new.status,'Received')),now());
  end if;
  return new;
end;$$;
drop trigger if exists order_status_history on public.orders;
create trigger order_status_history after insert or update on public.orders
for each row execute function public.capture_order_status_history();

commit;
