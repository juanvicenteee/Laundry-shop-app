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

## v3 — configurable geofencing + business hours

`migrate-mobile-app-v3-booking-rules.sql` moves the Cubao/MPlace
geofence radii out of hardcoded SQL/JS constants into an admin-editable
`service_areas` table, and adds business-hours + same-day-cutoff
enforcement (`booking_open_time`, `booking_close_time`,
`booking_days_mask`, `same_day_cutoff_time` on `settings`). Both are
editable from the ops app's Controls page — no manual setup beyond
running the SQL.

## v4 — customer accounts (Google/Facebook OAuth)

`migrate-mobile-app-v4-customer-accounts.sql` adds real customer
accounts. **Read the comment at the top of that file before running
it** — it also fixes a real privilege-escalation bug in the existing
`handle_new_user()` trigger that would otherwise let any customer who
signs up via Google/Facebook be silently granted a staff role.

Accounts are additive — the existing phone-only guest booking flow is
completely unchanged.

### One-time setup (you'll need to do this yourself)

OAuth app registration and provider configuration are account/dashboard
actions that require your own Google/Facebook developer accounts — I
can't create these for you:

1. **Google**: create an OAuth client in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (type: Web application). Add the redirect URI Supabase gives you
   (Authentication → Providers → Google in the Supabase dashboard shows
   the exact callback URL to paste back into Google Cloud Console).
2. **Facebook**: create an app at
   [Facebook for Developers](https://developers.facebook.com/apps/),
   add the Facebook Login product, and likewise copy Supabase's
   callback URL into it.
3. In the Supabase dashboard → Authentication → Providers, enable
   Google and Facebook and paste in each provider's Client ID/Secret
   (this step involves real secrets, so it has to be you, not me).
4. In Supabase dashboard → Authentication → URL Configuration, add
   `ph.bubblyfi.customer://auth-callback` to the allowed redirect URLs.

Until this is done, the "Continue with Google/Facebook" buttons in the
customer app will show a Supabase error toast instead of opening a
sign-in screen — everything else (guest booking) is unaffected.

## v5 — saved addresses + wash preferences

`migrate-mobile-app-v5-addresses-preferences.sql` adds `saved_addresses`
(multiple labeled addresses per account, one can be default) and
`wash_preferences` (water temperature, detergent type, fabric
conditioner, Zonrox Color Safe). Both are owner-scoped via RLS
(`customer_profile_id = auth.uid()`) rather than RPCs — the client
reads/writes the tables directly through a signed-in session. Only
available once an account exists (v4); no setup beyond running the SQL.

## v6 — abandoned-cart reminders

`migrate-mobile-app-v6-cart-recovery.sql` adds `booking_drafts` (one row
per device, keyed by FCM token — works for guests, no account needed),
written via `save_booking_draft(...)` as soon as a pickup slot is
chosen, and cleared via `clear_booking_draft(...)` on successful
submit. A `pg_cron` job runs every 5 minutes calling the new
`send-cart-abandonment-reminders` Edge Function, which pushes "Your
laundry basket is full! Complete your booking now." to any draft older
than 30 minutes with no reminder sent yet.

Also extracted the FCM-sending logic (JWT signing, token exchange,
`sendFcm`) out of `send-push-notification` into a shared
`supabase/functions/_shared/fcm.ts` module, since this is now the
second function that needs it.

### One-time setup

1. Run the SQL. If `create extension pg_cron;` errors with a
   permissions message, enable it yourself first via Supabase Dashboard
   → Database → Extensions → pg_cron, then re-run just the migration's
   "3. Scheduled job" section.
2. Deploy the new function:
   ```bash
   supabase functions deploy send-cart-abandonment-reminders --no-verify-jwt
   ```
3. Re-deploy `send-push-notification` too, since it now imports from
   `_shared/fcm.ts`:
   ```bash
   supabase functions deploy send-push-notification --no-verify-jwt
   ```
