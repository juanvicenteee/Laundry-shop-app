-- Bubbly-fi mobile v14: customer-facing delivery status messages.
-- Safe to run repeatedly in the Supabase SQL Editor.

-- The production orders table originally accepted only the pre-delivery
-- statuses. Update the existing constraint before the apps use the new values.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'Received','Washing','Drying','Ready','Ready for delivery','Ongoing delivery',
  'Rider already nearby','Delivered','Claimed'
)) not valid;
alter table public.orders validate constraint orders_status_check;

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
    when 'rider nearby' then 'Your delivery staff is already nearby. Please be ready.'
    when 'rider already nearby' then 'Your delivery staff is already nearby. Please be ready to receive your laundry.'
    when 'picked up' then 'Your laundry has been picked up.'
    when 'pickup complete' then 'Your laundry has arrived at the shop.'
    when 'washing' then 'Your laundry is being washed.'
    when 'drying' then 'Your laundry is being dried.'
    when 'folding' then 'Your laundry is being folded.'
    when 'processing' then 'Your laundry is being processed.'
    when 'ready' then 'Your laundry is ready.'
    when 'ready for pickup' then 'Your laundry is ready for pickup.'
    when 'ready for delivery' then 'Your laundry is ready and waiting for delivery.'
    when 'ongoing delivery' then 'Your laundry is on the way. Please keep your phone available.'
    when 'out for delivery' then 'Your laundry is out for delivery.'
    when 'delivered' then 'Your laundry has been delivered.'
    when 'claimed' then 'Your laundry has been claimed. Thank you for choosing Bubbly-fi.'
    when 'completed' then 'Your laundry order has been completed.'
    when 'cancelled' then 'Your laundry order was cancelled.'
    when 'rejected' then 'The booking could not be accepted. Contact Bubbly-fi for details.'
    else 'Your laundry order status is now ' || coalesce(nullif(trim(p_status),''),'Updated') || '.'
  end
$$;

grant execute on function public.bubblyfi_customer_status_message(text) to anon, authenticated, service_role;
