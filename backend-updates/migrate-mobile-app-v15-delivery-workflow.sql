-- Bubbly-fi mobile v15: allow the complete delivery lifecycle and add optional
-- delivery workflow metadata. Safe to run repeatedly in Supabase SQL Editor.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'Received','Washing','Drying','Ready','Ready for delivery','Ongoing delivery',
  'Rider already nearby','Delivered','Claimed'
)) not valid;
alter table public.orders validate constraint orders_status_check;

alter table public.orders add column if not exists assigned_rider_name text;
alter table public.orders add column if not exists assigned_rider_phone text;
alter table public.orders add column if not exists delivery_eta timestamptz;
alter table public.orders add column if not exists delivery_proof_type text;
alter table public.orders add column if not exists delivery_proof_reference text;
alter table public.orders add column if not exists delivery_proof_path text;
alter table public.orders add column if not exists delivery_received_at timestamptz;
alter table public.orders add column if not exists last_notification_status text;
alter table public.orders add column if not exists last_notification_error text;
alter table public.orders add column if not exists last_notification_at timestamptz;

alter table public.orders drop constraint if exists orders_delivery_proof_type_check;
alter table public.orders add constraint orders_delivery_proof_type_check
  check (delivery_proof_type is null or delivery_proof_type in ('OTP','Photo','Signature')) not valid;
alter table public.orders validate constraint orders_delivery_proof_type_check;

comment on column public.orders.assigned_rider_name is 'Optional delivery rider display name.';
comment on column public.orders.delivery_eta is 'Staff-provided estimated delivery time.';
comment on column public.orders.delivery_received_at is 'Time customer receipt was confirmed with OTP, photo, or signature proof.';
