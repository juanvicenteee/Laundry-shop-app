# Mobile app backend support

These files add what the Bubbly-fi customer and staff mobile apps need
from the **existing** Supabase project (`amjhrejmcnthlrqddznw`) that
already runs the Bubblyfi-POS web system. Nothing here touches or
deletes any existing data, table, or function from that system.

## ⚠️ v4 through v8: DO NOT RUN

While applying these migrations, we discovered a **separate AI session
had already built a complete, independent backend** for customer
accounts, addresses, wash preferences, cart recovery, marketing, and
referrals/coupons directly against the live database — with no source
file left behind anywhere (it only exists in the live Supabase schema).
`v4-customer-accounts.sql` in particular creates a `customer_profiles`
table with a different, incompatible shape than the one that's
actually live (`user_id` PK vs `id` PK, different columns). Running it
will error (as it already did once) or corrupt data.

**`v5` through `v8` were never applied** and should not be — they'd
create large-scale duplicate schema on top of what already exists
(`customer_addresses`, `customer_wash_preferences`, `booking_carts`,
`device_push_tokens`, `notification_preferences`, `coupons`,
`customer_coupons`, `referral_events`, `mobile_app_settings`, and the
RPCs `apply_mobile_booking_discount`, `complete_bubblyfi_referral`,
`get_mobile_app_config`, `mobile_request_guard`,
`consume_booking_rate_limit`). The client apps are being rewired to
call that real backend directly instead. See `v9` below for the one
part of `v4` that *is* still needed, and the in-progress reconciliation
plan for everything else.

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

**Superseded — do not run.** See the warning at the top of this file.
The real `customer_profiles` (PK `user_id`) + `handle_new_bubblyfi_user()`
already exist live with an incompatible shape; running this file will
error. The security fix section was extracted into `v9` instead.

## v5 — saved addresses + wash preferences

`migrate-mobile-app-v5-addresses-preferences.sql` adds `saved_addresses`
(multiple labeled addresses per account, one can be default) and
`wash_preferences` (water temperature, detergent type, fabric
conditioner, Zonrox Color Safe). Both are owner-scoped via RLS
(`customer_profile_id = auth.uid()`) rather than RPCs — the client
reads/writes the tables directly through a signed-in session. Only
available once an account exists (v4); no setup beyond running the SQL.

**Superseded — do not run.** The real `customer_addresses` and
`customer_wash_preferences` tables already exist live; the client apps
call those instead.

## v6 — abandoned-cart reminders (kept — not superseded)

There's also a real `booking_carts` table (account-scoped, `user_id`+
`cart_key`) already live. We're deliberately keeping this one instead
of switching to that: `booking_drafts` works for guests with no
account, and there's no collision (different table name) or reason to
require login just for a cart-abandonment nudge. Both can coexist.

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

## v7 — marketing broadcast by area

`migrate-mobile-app-v7-marketing.sql` adds `last_known_area` +
`marketing_opt_in` to `customer_devices` (updated automatically every
time a customer's device registers, using their detected/selected
service area), plus `count_marketing_recipients(area)` and
`broadcast_marketing(area, title, body)` (admin-only). The ops app's
Controls page gets a new "Marketing broadcast" panel: pick an area
(All/Cubao/MPlace), preview the recipient count, then send — with a
confirmation dialog since it's irreversible.

### One-time setup

Deploy the new function:
```bash
supabase functions deploy send-marketing-broadcast --no-verify-jwt
```

**Superseded — do not run.** The real `marketing_campaigns` table
already exists live (though the actual send mechanism it uses is still
being investigated as of the reconciliation work — see the plan). The
ops app's Broadcast panel will be rewired once that's confirmed.

## v8 — referral codes + first-order discount

`migrate-mobile-app-v8-referrals-coupons.sql` adds one unified
"coupon or referral code" field, checked via `check_coupon(code, phone)`
and applied inside `submit_customer_order` via a new optional
`p_coupon_code` parameter (added as a trailing default-valued
parameter, so it doesn't disturb the v3 signature). Three kinds of
code, all typed into the same input:

- **`BUBBLYNEW`** — global, 10% off, valid only for a phone's first
  booking.
- **A referral code** (`referral_codes`, one per customer, auto-created
  via `get_or_create_referral_code`) — also 10% off, also
  first-booking-only, and issues the referrer a ₱50 flat coupon **once
  the referred customer's booking is actually submitted** (not merely
  when the code is typed in) — this ties the reward to a completed
  booking rather than letting someone claim it without ever booking.
- **A personal coupon** (`coupons`, e.g. the ₱50 referral reward) —
  flat or percent, single-use, phone-scoped.

The discount is applied as an `UPDATE` after the insert, since the
existing pricing trigger already computed `total` and its internals
aren't something this migration should guess at and risk breaking. No
setup beyond running the SQL — no new Edge Function or secret needed.

**Superseded — do not run.** See the warning at the top of this file.
The real referral/coupon system (`coupons`, `customer_coupons`,
`referral_events`, `apply_mobile_booking_discount`,
`complete_bubblyfi_referral`) already exists live; the client apps call
that instead.

## v9 — security fix: gate handle_new_user() on auth provider

`migrate-mobile-app-v9-security-fix.sql` captures in git a fix that was
already applied ad hoc via the SQL Editor during live debugging. The
existing `handle_new_user()` trigger fires on every `auth.users` insert
and grants a staff `profiles` role (`role='operator'`) to anyone whose
email isn't literally `admin@bubblyfi.app` — since customers now sign
up via Google/Facebook OAuth (handled separately by the pre-existing
`handle_new_bubblyfi_user()` trigger), every customer signup would also
silently receive staff access. The fix gates the insert on
`raw_app_meta_data->>'provider' = 'email'`, since staff accounts are
always created as email+password and customer accounts always via
OAuth — a split the signing-up user can't spoof.

Safe to run again even though it's already live — `create or replace`
is idempotent. No setup beyond running the SQL.

## v10 — dedupe guard logic + build the missing marketing send path

`migrate-mobile-app-v10-dedupe-and-marketing.sql` is the second and
final piece of the reconciliation with the pre-existing ChatGPT-built
backend (see the warning at the top of this file). Two things:

1. **Simplifies `mobile_request_guard()`.** It previously duplicated
   business-hours/same-day-cutoff enforcement that `submit_customer_order()`
   already does (reading a *different* settings table — `mobile_app_settings`
   vs `settings`, the one the ops app's Controls page actually edits) —
   removed. It also classified area from `pin_lat`/`pin_lng`, columns
   nothing writes to (the client only ever populates `gps_lat`/`gps_lng`,
   already correctly classified by the pre-existing, pricing-critical
   `customer_request_area_from_gps` trigger) — removed. The one thing
   this trigger still uniquely does: block outside-Cubao bookings
   entirely when `mobile_app_settings.allow_outside` is off — a real,
   currently-enforced toggle that had no UI anywhere until this
   migration's client-side companion change added one to the ops app's
   Controls page.
2. **Builds the marketing broadcast send path.** `marketing_campaigns`
   existed as a log table with no sender anywhere in SQL — confirmed
   via diagnostic queries during this session. Adds
   `count_marketing_recipients(area)` / `broadcast_marketing(area,
   title, body)` RPCs (admin-only, gated on `is_bubblyfi_admin()`)
   targeting the real `device_push_tokens`/`notification_preferences`
   tables, paired with a retargeted `send-marketing-broadcast` Edge
   Function that reuses the FCM-sending helper already extracted to
   `_shared/fcm.ts` in v6.

   **⚠️ Correction, see the section below: these turned out to be
   redundant.** "No sender anywhere" was based on SQL-only diagnostics
   (`pg_proc`, `information_schema`) — Edge Functions are invisible to
   those queries entirely. A real, already-deployed
   `send-marketing-push` function existed the whole time. The ops app
   now calls that instead; `count_marketing_recipients`/
   `broadcast_marketing` are unused but left in place (harmless).

### One-time setup

Deploy the retargeted function:
```bash
supabase functions deploy send-marketing-broadcast --no-verify-jwt
```

## Post-v10: discovering the real Edge Functions (`supabase functions list`)

Everything above was diagnosed via SQL alone (`information_schema`,
`pg_proc`, `pg_trigger`) — but **Edge Functions live outside Postgres
and are completely invisible to those queries.** Running
`supabase functions list` revealed five real, already-deployed
functions with no local source, overlapping with what this
reconciliation built:

- **`submit-customer-order`** — the real booking entry point. Requires
  Cloudflare Turnstile CAPTCHA verification plus an `Origin` header
  allowlist. This is web-form anti-bot protection that doesn't fit a
  native, app-store-distributed app well — **decision: leave this
  alone**, the client keeps calling the `submit_customer_order` RPC
  directly (already works, confirmed throughout this session).
- **`register-device`** — functionally equivalent to the client's
  direct `device_push_tokens` upsert (same effect, adds server-side
  token-length validation). Not worth switching — low value.
- **`push-order-status`** — the real, staff-initiated order-status push
  mechanism, and the actual writer of `order_status_events` (earlier
  incorrectly diagnosed as a dead/orphaned table — it isn't, it's
  populated by this function). **This exposed a real bug**: my
  trigger-based auto-push (`notify_order_status`/
  `notify_customer_request_status` → `send-push-notification`) still
  looked up the retired `customer_devices` table by phone, so it had
  been silently sending to zero devices since device registration
  moved to `device_push_tokens` earlier in this reconciliation. Fixed
  by updating `send-push-notification`'s handlers to look up
  `device_push_tokens` by `user_id` (resolved from
  `customer_order_requests.user_id` or `orders.customer_user_id` /
  `orders.customer_id → customers.user_id`, matching the same
  resolution `push-order-status` uses) instead. The trigger-based
  approach is kept (no ops-app UI changes needed) rather than switching
  to calling `push-order-status` directly.
- **`send-abandoned-cart-reminders`** — a complete, real,
  account-scoped cart-abandonment system (`booking_carts`), but nothing
  currently writes to that table, so it's dormant. No collision with
  the guest-friendly `booking_drafts` system from v6 — left as-is.
- **`send-marketing-push`** — the real, complete, already-working
  marketing send mechanism (filters by area, respects
  `notification_preferences.marketing`, logs to `marketing_campaigns`).
  Makes the v10 `broadcast_marketing`/`send-marketing-broadcast` fully
  redundant. The ops app's Broadcast panel now calls
  `sb.functions.invoke('send-marketing-push', ...)` directly instead
  (the recipient-count preview button now does a lightweight client-side
  count query, since `send-marketing-push` has no dry-run mode).

**Redeploy `send-push-notification`** after this fix:
```bash
supabase functions deploy send-push-notification --no-verify-jwt
```
