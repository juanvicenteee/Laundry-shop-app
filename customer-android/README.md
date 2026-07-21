# Bubbly-fi Android Apps

Two separate Android applications built from the current Bubbly-fi web system:

1. **Bubbly-fi Operations** (`ph.bubblyfi.operations`) — Admin and Operator POS/dashboard.
2. **Bubbly-fi Laundry** (`com.bubblyfi.laundry`) — Public customer booking application.

Both apps package the web interface locally and connect to the existing Supabase project over HTTPS. They use the Android system photo picker, optional GPS permissions, external-app links for Google Maps/Messenger/LalaMove, and native Philippine-English text-to-speech fallback for staff order alerts.

## Open and build

1. Install Android Studio with Android SDK 35.
2. Open this root folder.
3. Let Gradle synchronize.
4. Build either module:
   - `staffApp`
   - `customerApp`

Command-line tasks when Gradle 8.9 is installed:

```bash
gradle :staffApp:assembleDebug
gradle :customerApp:assembleDebug
gradle :staffApp:bundleRelease
gradle :customerApp:bundleRelease
```

Debug APK outputs:

```text
staffApp/build/outputs/apk/debug/staffApp-debug.apk
customerApp/build/outputs/apk/debug/customerApp-debug.apk
```

Release AAB outputs:

```text
staffApp/build/outputs/bundle/release/staffApp-release.aab
customerApp/build/outputs/bundle/release/customerApp-release.aab
```

Release bundles must be signed with your upload key before Play Store submission. See `docs/BUILD-SIGN-PUBLISH.md`.

## Important

- Run all Supabase SQL migrations required by the deployed web version before using the apps.
- The customer app uses the same GCash, service pricing, GPS-area logic, photo uploads, SMS/email workflow, and customer-request database as the website.
- The staff app uses the same Admin/Operator accounts and permissions.
- Real-time alarm and voice alerts work while the staff app is open. True background push notifications require Firebase Cloud Messaging and a server-side push function, which is not included in version 1.0.
