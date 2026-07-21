# Build, sign, and publish

## 1. Requirements

- Android Studio
- Android SDK Platform 35
- JDK 17 or newer
- Gradle 8.9 (Android Studio can manage this)

## 2. Test debug apps

Select a module in Android Studio and press **Run**, or use:

```bash
gradle :staffApp:assembleDebug :customerApp:assembleDebug
```

## 3. Create an upload key

```bash
keytool -genkeypair -v \
  -keystore bubblyfi-upload-key.jks \
  -alias bubblyfi \
  -keyalg RSA -keysize 4096 -validity 10000
```

Keep this file and its passwords private. Do not commit it to Git.

## 4. Configure signing

Copy `keystore.properties.example` to `keystore.properties` and enter the real values:

```properties
storeFile=bubblyfi-upload-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=bubblyfi
keyPassword=YOUR_KEY_PASSWORD
```

Then build:

```bash
gradle :staffApp:bundleRelease :customerApp:bundleRelease
```

## 5. Play Console

Create two Play Console apps with these package names:

- `ph.bubblyfi.operations`
- `com.bubblyfi.laundry`

Upload the matching `.aab` file to each app. Enable Play App Signing and complete the Data safety, privacy-policy, content-rating, and app-access sections.

The Operations app requires staff credentials for review. In **App access**, provide a working review account or clear access instructions. Do not publish shared production Admin credentials in the public store listing.
