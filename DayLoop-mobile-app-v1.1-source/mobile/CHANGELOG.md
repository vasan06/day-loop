# Changelog
## 1.1.0
- Bundled Manrope and DM Sans (woff2, SIL OFL) locally; CSP tightened (font-src/object-src/base-uri/form-action); pinch-zoom re-enabled for accessibility.
- Recurring tasks (daily/weekly/monthly): completing one creates the next occurrence once (with reminder time and fresh subtasks); monthly keeps the original day, clamped to month length.
- Import backup (JSON): full schema validation, size limit, confirm step with counts, safety copy saved to DayLoop/exports before replacing; bad files never touch live data.
- Dark mode (prefers-color-scheme), 48px touch targets, landscape tweak, focus ring.
- Exact-alarm consent button (Android 12+); falls back to inexact reminders if declined.
- Android patch script: no cleartext traffic, status bar #69465F, versionName from package.json, env-var release signing (keystore stays outside the repo).
- CI builds debug APK always, and signed release APK + AAB when signing secrets are set.
- Fixed: next occurrence of a task overdue by years was computed wrongly (loop cap).
