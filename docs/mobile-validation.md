# Mobile validation and handoff

Validated locally on 2026-10-26 using Flutter 3.47.8 / Dart 3.13.7:

- Flutter analysis: no issues.
- Flutter tests: 21 passing, covering simulation, progression, save validation,
  web compatibility, phone/tablet layouts, text scaling, and lifecycle pauses.
- Existing web tests: 110 passing.
- Production web build and mobile-to-web save import/continued simulation: passing.
- Store artwork/screenshot generation: two passing capture tests; 24 widget-rendered
  screenshots across six phone/tablet sizes. These are not device captures.
- Android unsigned release bundle builds successfully with API 36 / minimum API 26.
  Release manifest removes Internet and network-state permissions.
- iOS plist, privacy manifest, and Xcode project syntax checks passed.

Full Xcode was unavailable locally, so iOS compilation is not yet verified.
The added GitHub Actions workflow builds both native platforms; its results must
be checked after pushing. No browser testing was performed for final validation.

Signing, real-device audio/haptics/file-sharing/backup checks, platform accessibility,
and store submission remain owner tasks. Follow [the release checklist](../mobile/RELEASE.md).
The Android bundle is unsigned and is not directly uploadable to Google Play.
Build output, signing keys, local SDK configuration, and caches are excluded from Git.

The owner will create the PR from `feat/flutter-mobile` to `main`.
