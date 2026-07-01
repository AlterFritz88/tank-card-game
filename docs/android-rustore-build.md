# Android / RuStore build

The Android client is packaged with Capacitor. The native project lives in:

```text
tank-card-game/android
```

## App identity

- App name: `Panzershrek`
- Android application id: `com.panzershrek.game`
- Web assets folder: `tank-card-game/dist`
- Android env file: `tank-card-game/.env.android`

The Android build uses the deployed server:

```text
VITE_PVP_SERVER_URL=wss://panzershrek-server-burdin009.amvera.io
VITE_PROFILE_SERVER_URL=wss://panzershrek-server-burdin009.amvera.io
```

The real `.env.android` is ignored by git. If it is missing, copy:

```powershell
Copy-Item .env.android.example .env.android
```

## Requirements

Install these locally before building APK/AAB:

1. Android Studio
2. Android SDK Platform 36
3. JDK 17+ and `JAVA_HOME`

Android Studio usually includes a JDK at:

```powershell
C:\Program Files\Android\Android Studio\jbr
```

If that path exists, set it for the current PowerShell session:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## Build and sync web assets

From `tank-card-game`:

```powershell
npm.cmd run android:sync
```

This runs the Vite Android build and copies `dist` into the Android project.

## Debug APK

From `tank-card-game`:

```powershell
npm.cmd run android:debug
```

Expected output:

```text
tank-card-game/android/app/build/outputs/apk/debug/app-debug.apk
```

## Release AAB

From `tank-card-game`:

```powershell
npm.cmd run android:release
```

Expected output:

```text
tank-card-game/android/app/build/outputs/bundle/release/app-release.aab
```

For RuStore publication, create a release signing key and configure Android
release signing in `tank-card-game/android/app/build.gradle` or through Android
Studio. Keep `.jks` / `.keystore` files out of git.

## Open in Android Studio

From `tank-card-game`:

```powershell
npm.cmd run android:open
```

Before every store build, run `npm.cmd run android:sync` so Android contains
the latest game assets and TypeScript/Vite output.
