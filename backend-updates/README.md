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

## v2 — real push via Firebase Cloud Messaging (FCM)

`migrate-mobile-app-v2-fcm-and-notifications.sql` adds real background
push for the native `customer-android` and `operations-android` apps
(neither had any push infrastructure before this — only a staff-only
Expo pipeline that fires on new-request insert). It adds:

1. **`customer_devices`** — FCM tokens for customer devices, keyed by
   phone (same trust model as `get_my_requests`).
2. **`upsert_customer_device(...)`** — the customer app calls this once
   it has an FCM token.
3. **`push_tokens.fcm_token`** (new nullable column) +
   **`upsert_staff_push_token(...)`** — lets the native
   `operations-android` app register too, without touching whatever
   still uses the old Expo-based admin-app's `expo_push_token` column.
4. **`notification_log`** — idempotency ledger so a status change never
   double-sends a push.
5. Triggers on `customer_order_requests` and `orders` that fire on
   **status change** (Confirmed/Scheduled/Rejected and
   Washing/Drying/Ready/Claimed respectively), not just insert.
6. **`notify_rider_approaching(order_id, rider_lat, rider_lng)`** —
   called by the "📍 On my way" button in the operations app; computes
   distance to the customer's saved pickup pin and sends a push.

The Edge Function (`send-push-notification`) was rewritten to send via
**FCM's HTTP v1 API** (it still supports the legacy Expo path for any
device still registered the old way). This requires a Firebase project:

### One-time setup (you'll need to do this yourself)

1. Create a free project at [Firebase Console](https://console.firebase.google.com/).
2. Add two Android apps to it with package names `ph.bubblyfi.customer`
   and `ph.bubblyfi.operations`, download each `google-services.json`,
   and hand both files back — they're safe-to-commit client config, not
   secrets. Drop them into `customer-android/app/google-services.json`
   and `operations-android/app/google-services.json`. The Gradle build
   only activates FCM once each file is present, so nothing breaks in
   the meantime.
3. In Firebase Console → Project settings → Service accounts, generate
   a new private key (downloads a JSON file). Set it as an Edge
   Function secret yourself (this is a real secret, so I won't handle
   it):
   ```bash
   supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat path/to/service-account.json)"
   ```
4. Re-deploy the function:
   ```bash
   supabase functions deploy send-push-notification --no-verify-jwt
   ```

Until steps 1–3 are done, the SQL/trigger/RPC side works end-to-end,
but `sendFcm(...)` will return `{ sent: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured yet.' }` instead of actually delivering a push — everything else (idempotency, status
tracking) still runs correctly.
