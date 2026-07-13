# Mobile app backend support

These files add what the Bubbly-fi customer and staff mobile apps need
from the **existing** Supabase project (`amjhrejmcnthlrqddznw`) that
already runs the Bubblyfi-POS web system. Nothing here touches or
deletes any existing data, table, or function from that system.

## What this adds

1. **`get_my_requests(phone)`** — lets a customer look up their own
   booking status by phone number. There was previously no read path
   for customers at all.
2. **`push_tokens` table** — stores each admin/operator device's Expo
   push token.
3. **`push_sent_at` column** on `customer_order_requests` — idempotency,
   same pattern as the existing `*_sent_at` columns.
4. **A trigger + Edge Function** — every new customer request fires a
   push notification to all registered staff devices, via `pg_net`
   calling the new `send-push-notification` function. Unlike the
   existing `send-booking-sms` function (which the client calls
   directly after a successful booking), this one is triggered by the
   database itself, so it fires even if the customer's app doesn't
   make a follow-up call.

## How to apply

1. Open the Supabase SQL Editor for this project and run
   `migrate-mobile-app-v1.sql`.
2. Deploy the new function (same pattern as `send-booking-sms`):
   ```bash
   supabase login
   supabase link --project-ref amjhrejmcnthlrqddznw
   supabase functions deploy send-push-notification --no-verify-jwt
   ```
   `--no-verify-jwt` is required because the database trigger calls
   this function without a user JWT (same reasoning as the SMS
   function's client-side anonymous calls).
3. No new secrets are required — the function only needs
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which every deployed
   Edge Function already receives automatically.

## Verifying it worked

- After applying the SQL, confirm `select * from public.push_tokens;`
  runs without error (empty table is fine — it fills in once a staff
  member logs into the mobile app).
- Submit a test booking through the customer app or `customer.html`,
  then check the function logs (`supabase functions logs
  send-push-notification`) to confirm it ran. With zero rows in
  `push_tokens` it will run successfully and just send to nobody
  (`tokenCount: 0`) until a staff member has logged into the mobile
  admin app at least once.
