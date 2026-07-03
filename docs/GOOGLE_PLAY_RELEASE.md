# Google Play release

This guide is for publishing the Capacitor Android app to Google Play.

## Current app identity

- App name: `Panzershrek`
- Android application id: `com.panzershrek.game`
- Minimum SDK: 24
- Compile SDK: 36
- Target SDK: 36
- Release bundle: `tank-card-game/android/app/build/outputs/bundle/release/app-release.aab`

Google Play package names cannot be changed after the app is created, so confirm
`com.panzershrek.game` before creating the Play Console app.

## Local build requirements

Use Android Studio's bundled JBR 21 instead of a bleeding-edge JDK:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

Then build from `tank-card-game/`:

```powershell
npm.cmd run android:release
```

Expected output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

The release build expects these local files in `tank-card-game/android/`:

```text
keystore.properties
release-key.jks
```

Keep both out of git. The example file is:

```text
keystore.properties.example
```

## Before uploading

- Run `npm.cmd run android:release`.
- Smoke-test the same build on a real Android device if possible.
- Confirm the production `.env.android` points to public `wss://` server URLs.
- Confirm `android/app/src/main/AndroidManifest.xml` only requests necessary
  permissions. Currently it requests `INTERNET`.
- Increment `versionCode` in `android/app/build.gradle` for every new upload.
- Update `versionName` when the user-facing version changes.
- Keep a backup of the upload key and passwords outside the repository.

## Play Console checklist

1. Create the app in Play Console.
2. Choose the package name from the uploaded AAB: `com.panzershrek.game`.
3. Enroll in Play App Signing when prompted.
4. Upload `app-release.aab` to Internal testing first.
5. Fill in Store listing: app name, short description, full description,
   screenshots, feature graphic, app icon, category, contact email.
6. Complete App content:
   - Privacy Policy URL.
   - Data safety form.
   - Ads declaration.
   - App access instructions if login or server access is required.
   - Content rating questionnaire.
   - Target audience and children policy.
   - News apps / government apps / financial features only if relevant.
7. Add testers and run an internal test.
8. Promote the same release to Closed testing or Production after validation.

## Store assets to prepare

- App icon: 512 x 512 PNG.
- Feature graphic: 1024 x 500 PNG/JPG.
- Phone screenshots: at least 2, usually 1080p or higher looks best.
- Optional tablet screenshots if tablet support is intended.
- Short description: up to 80 characters.
- Full description: up to 4000 characters.
- Support email.
- Privacy Policy public URL.

## Useful official docs

- Target SDK requirements:
  https://developer.android.com/google/play/requirements/target-sdk
- Build and upload Android App Bundles:
  https://developer.android.com/guide/app-bundle
- Play App Signing:
  https://support.google.com/googleplay/android-developer/answer/9842756
- Create and set up an app in Play Console:
  https://support.google.com/googleplay/android-developer/answer/9859152
- Data safety:
  https://support.google.com/googleplay/android-developer/answer/10787469
- Privacy Policy:
  https://support.google.com/googleplay/android-developer/answer/10144311
