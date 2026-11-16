// Run once after `npx cap add android`. Idempotent. Permissions, no-backup, no-cleartext, status-bar colour,
// versioning and env-var based release signing (keystore stays OUTSIDE the repo).
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('android/app/src/main'); const mf = path.join(root, 'AndroidManifest.xml');
if (!fs.existsSync(mf)) { console.error('android/ not found - run `npx cap add android` first'); process.exit(1); }
let x = fs.readFileSync(mf, 'utf8');
for (const p of ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'SCHEDULE_EXACT_ALARM'])
  if (!x.includes(`android.permission.${p}"`)) x = x.replace('<application', `<uses-permission android:name="android.permission.${p}" />\n    <application`);
x = x.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
if (!x.includes('usesCleartextTraffic')) x = x.replace('<application', '<application android:usesCleartextTraffic="false"');
fs.writeFileSync(mf, x);

fs.mkdirSync(path.join(root, 'res/drawable'), { recursive: true });
fs.writeFileSync(path.join(root, 'res/drawable/ic_stat_icon.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFF" android:pathData="M7,19h2v-7H7zM11,19h2V5h-2zM15,19h2v-10h-2z"/></vector>\n`);

// status-bar colour (#69465f)
const colors = path.join(root, 'res/values/colors.xml');
fs.mkdirSync(path.dirname(colors), { recursive: true });
fs.writeFileSync(colors, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="colorPrimary">#69465F</color>\n  <color name="colorPrimaryDark">#69465F</color>\n  <color name="colorAccent">#DF785F</color>\n</resources>\n`);
const styles = path.join(root, 'res/values/styles.xml');
if (fs.existsSync(styles)) { let st = fs.readFileSync(styles, 'utf8');
  if (!st.includes('android:statusBarColor')) st = st.replace('<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">', '<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">\n        <item name="android:statusBarColor">#69465F</item>');
  fs.writeFileSync(styles, st); }

// versioning + signing from env vars: DAYLOOP_STORE_FILE, DAYLOOP_STORE_PASSWORD, DAYLOOP_KEY_ALIAS, DAYLOOP_KEY_PASSWORD
const gf = path.resolve('android/app/build.gradle'); let g = fs.readFileSync(gf, 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const code = Number(process.env.DAYLOOP_VERSION_CODE || 2);
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
if (!g.includes('DAYLOOP_STORE_FILE')) {
  g = g.replace(/android \{/, `android {
    signingConfigs {
        release {
            if (System.getenv("DAYLOOP_STORE_FILE")) {
                storeFile file(System.getenv("DAYLOOP_STORE_FILE"))
                storePassword System.getenv("DAYLOOP_STORE_PASSWORD")
                keyAlias System.getenv("DAYLOOP_KEY_ALIAS")
                keyPassword System.getenv("DAYLOOP_KEY_PASSWORD")
            }
        }
    }`);
  g = g.replace(/buildTypes \{\s*release \{/, `buildTypes {
        release {
            if (System.getenv("DAYLOOP_STORE_FILE")) { signingConfig signingConfigs.release }`);
}
fs.writeFileSync(gf, g);
console.log('android project patched');
