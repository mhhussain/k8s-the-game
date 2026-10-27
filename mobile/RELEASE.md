# Release handoff

The app is a paid **US $0.99** download with no further purchases. Pricing is set
in the store consoles, not the application binary. The owner handles signing,
paid-app agreements, tax/banking, store records, uploads, and submission.

## Before submission

1. Merge the reviewed PR. Wait for GitHub Pages deployment, then verify:
   - https://mhhussain.github.io/k8s-the-game/privacy.html
   - https://mhhussain.github.io/k8s-the-game/support.html
2. Read `store/listing.md` and confirm seller/contact information.
3. Install Flutter 3.47.8 and run `flutter pub get`, `flutter analyze`, `flutter test`.
4. Check native release CI and the validation notes. A passing widget test is not a real-device test.
5. Complete the device checklist below before submitting a signed binary.
6. Use `store/artwork/` and the appropriately sized `store/screenshots/` sets.

## Android / Google Play

Project targets API 36 with minimum API 26. Current Flutter uses NDK 28.2 and
modern Android build tooling. Keep the lockfile and pinned Flutter version.

Generate an upload keystore in a private location outside this repository:

```sh
keytool -genkey -v -keystore /your/private/path/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Copy `android/key.properties.example` to `android/key.properties`, supply your
private path and credentials, and keep both file and keystore private. These
files are ignored by Git. The Gradle release build uses owner signing only when
that file exists; it never substitutes the debug key for a release.

```sh
flutter build appbundle --release
```

Output: `build/app/outputs/bundle/release/app-release.aab`. Without the properties
file this is unsigned, useful for build validation but not store upload. With
the file it is signed with your upload key. Enroll in Play App Signing and keep
your upload key backed up. For installing a development build on a device use
`flutter run`, or `flutter build apk --debug`.

Create the Play Console app under `xyz.moohh.k8sthegame`; choose paid before
launch, set US $0.99 and regional prices, complete store listing, app access,
content rating, data safety, target audience, developer verification and other
account-specific forms. No login is needed for review. Upload to internal testing
first, then follow any testing prerequisites attached to your account.

The release manifest removes Internet and network-state permissions. Verify the
merged release manifest and actual signed artifact. Check 16 KB memory page
compatibility with Play's bundle analysis and a compatible device/emulator.

## iOS / App Store Connect

Install full Xcode and its iOS platform components. Select it as the active
Developer directory and accept the Xcode license in your normal development setup.
Install CocoaPods if Flutter requests it for a plugin. Run `flutter doctor -v`.

```sh
flutter build ios --release --no-codesign
open ios/Runner.xcworkspace
```

In Xcode select Runner → Signing & Capabilities → your team, with bundle ID
`xyz.moohh.k8sthegame`. Use automatic signing with your account. No team ID,
certificate, provisioning profile, or private signing key is committed here.

Create the App Store Connect app with this bundle ID and app name. Set the paid
price to US $0.99 and regional equivalents. Build/archive for a generic iOS device:

```sh
flutter build ipa --release
```

If automatic export needs an ExportOptions file, export once through Xcode
Organizer with your team and use that owner-generated file with
`flutter build ipa --release --export-options-plist=/private/path/ExportOptions.plist`.
Upload through Xcode Organizer or Transporter, test via TestFlight, then submit.

The app includes a no-tracking/no-collection privacy manifest. Native plugins
supply their own required-reason API manifests; inspect Xcode's aggregated privacy
report from the final archive. `ITSAppUsesNonExemptEncryption=false` reflects no
custom cryptography; answer Apple's export-compliance questions for the final build.

## Store assets

- `store/artwork/app-icon-1024.png`: iOS marketing icon; opaque, square.
- `store/artwork/google-play-icon-512.png`: Play icon.
- `store/artwork/google-play-feature-1024x500.png`: Play feature graphic.
- Four actual Flutter screen renders per device family under `store/screenshots/`.
- iPhone 6.9: 1320×2868; iPhone 6.5: 1284×2778; iPhone 6.3: 1206×2622.
- iPad 13: 2064×2752; Android phone: 1080×2400; Android tablet: 1600×2560.

Use the sizes accepted by your current console; requirements and device families
change. Capture final native-device screenshots if the console requires additional
families. Do not upload screenshots with debug banners or placeholder glyphs.

## Device checklist (owner before launch)

- Fresh install and cold launch in airplane mode. No network prompts or missing assets.
- Complete the first-ticket tutorial using only touch; skip and re-enable guidance.
- Build, deploy, change replicas, set probes/affinity/manual placement, restart/remove services.
- Tag/provision/decommission nodes, purchase upgrades, resolve/reopen tickets.
- Continue after win/loss; funding limits and paused state remain sensible.
- Background during play, during an edit, during file picking, and during a dialog.
  Return paused with edits preserved while the process remains alive; no elapsed-time catch-up.
- Force quit/relaunch: last completed autosave loads paused. Unsaved form edits are transient.
- Save/load/delete all three slots. Cancel file picking and sharing. Import malformed files.
- Export/import through Files and Android Documents; transfer both directions with the web game.
- Verify sound obeys silent mode, independent haptics switch, no music interruption.
- Portrait/landscape on a small phone and tablet; keyboard, safe areas, split-screen, larger text.
- VoiceOver/TalkBack navigation and readable status labels; reduced motion.
- OS backup/restore if enabled on your devices. Keep a manual export regardless.
- Final icon, splash screen, version/build number, policy/support links, licenses and privacy report.
- TestFlight and Play internal testing with the actual signed release artifacts.

## Sources checked during implementation (October 26, 2026)

- Flutter supported platforms: https://docs.flutter.dev/reference/supported-platforms
- Flutter Android release: https://docs.flutter.dev/deployment/android
- Flutter iOS release: https://docs.flutter.dev/deployment/ios
- Google target API policy: https://developer.android.com/google/play/requirements/target-sdk
- Apple upcoming requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple screenshots: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

Recheck these at submission. Build success and complete artifacts cannot guarantee
store approval; the owner must review the account-specific declarations and final binary.
