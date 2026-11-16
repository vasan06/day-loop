# DayLoop Mobile (Android)

Native-wrapped (Capacitor) version of DayLoop: Today dashboard, Tasks (subtasks, priorities, projects, reminders), Habits (streaks, 12-week heatmap, rates),
Money (income/expense, budgets with 80%/100% alerts, category donut, 6-month chart, savings goals), Notes, Calendar, Projects, Achievements, Notifications.
Same warm editorial design language as the web app. **100% offline - no account, no server.**

## Storage
All data lives in **one folder** in the app's private storage: `DayLoop/` (`data.json`, `data.bak.json`, `exports/`).
Settings > *Delete all data* removes the whole folder; uninstalling the app does too.

## Get the APK (pick one)
1. **GitHub Actions (no setup):** push this repo, open *Actions > Build DayLoop Android APK > Run workflow*, download the `DayLoop-debug-apk` artifact, unzip, install `app-debug.apk`.
2. **Your PC (Android SDK + JDK 17 installed):**
   ```
   cd mobile
   npm install
   npx cap add android
   node scripts/patch-android.mjs
   npx @capacitor/assets generate --android --assetPath resources
   npx cap sync android
   cd android && gradlew assembleDebug      # APK: app/build/outputs/apk/debug/app-debug.apk
   ```
   Enable "Install unknown apps" on the phone to sideload.

## Tests
`npm test` (pure logic) and `node tests/e2e.mjs` (UI in headless Chromium; needs Playwright).

## Layout
`www/js/store.js` state, validation, storage, streak/finance/achievement logic - `notify.js` reminders - `charts.js` SVG charts - `app.js` screens.

## Release build (1.1)
```
npm install && npm test && node tests/e2e.mjs
npx cap add android && node scripts/patch-android.mjs
npx @capacitor/assets generate --android --assetPath resources
npx cap sync android && cd android && ./gradlew assembleDebug
```
Signed release (keystore kept OUTSIDE the repo):
```
keytool -genkeypair -v -keystore ~/dayloop.jks -alias dayloop -keyalg RSA -keysize 2048 -validity 10000
export DAYLOOP_STORE_FILE=~/dayloop.jks DAYLOOP_STORE_PASSWORD=... DAYLOOP_KEY_ALIAS=dayloop DAYLOOP_KEY_PASSWORD=...
./gradlew assembleRelease bundleRelease
```
CI secrets: DAYLOOP_KEYSTORE_B64 (base64 of the .jks), DAYLOOP_STORE_PASSWORD, DAYLOOP_KEY_ALIAS, DAYLOOP_KEY_PASSWORD.
