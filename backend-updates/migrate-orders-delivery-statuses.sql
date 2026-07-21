begin;

-- Replace the legacy five-value order status constraint with the complete
-- pickup, processing, and delivery lifecycle used by Operations and Customer.
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'Received',
      'Rider assigned',
      'Picked up',
      'Received at shop',
      'Washing',
      'Drying',
      'Ready',
      'Ready for delivery',
      'Ongoing delivery',
      'Rider nearby',
      'Arrived',
      'Delivered',
      'Claimed',
      'Cancelled'
    )
  );

-- Preserve existing rows while moving the old Ready status to the more
-- explicit delivery wording only when delivery was requested.
update public.orders
set status = 'Ready for delivery'
where status = 'Ready'
  and coalesce(delivery_type, '') <> 'self_pickup';

commit;
