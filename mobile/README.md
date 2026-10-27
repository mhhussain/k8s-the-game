# Kubernetes: The Game — Flutter

Complete offline mobile edition. Application ID: `xyz.moohh.k8sthegame`.
Flutter **3.47.8**, Dart **3.13.7**, iOS **15+**, Android **8+ (API 26)**.

## Run and validate

Install Flutter 3.47.8, full Xcode for iOS, and Android SDK + JDK 17 for Android.
Then, from this directory:

```sh
flutter pub get
flutter analyze
flutter test
flutter run
```

Keep Flutter commands sequential: tests/debug runs regenerate native plugin
registration with test dependencies, while release builds exclude those plugins.
Do not run tests and native release builds concurrently in the same checkout.

```sh
flutter build appbundle --release        # unsigned until android/key.properties exists
flutter build ios --release --no-codesign
```

Signing, store submission, pricing, and final device checks are covered in
[RELEASE.md](RELEASE.md). Store text and graphics live in [store/](store/).

## Structure

- `lib/engine/`: deterministic Dart simulation, content, criteria, save validation.
- `lib/engine/catalog.dart`: generated initial state and tuning catalog from the web engine.
- `lib/controller.dart`: lifecycle, serialized atomic file writes, sound, haptics, settings.
- `lib/ui/`: adaptive screens, native file/share integration, tutorial and offline help.
- `lib/l10n/`: English shell localization resources and generated bindings. Game content is centralized in the engine; additional UI/help text remains in its screen modules for a future translation pass.
- `test/`: engine regressions, web-state reference fixtures, balance policy, responsive widgets, lifecycle tests.
- `tool/capture_store_test.dart`: actual Flutter screenshot and original-logo asset generation.
- `assets/`: locally bundled fonts and original synthesized sound effects.

## Saves and lifecycle

The web's version-1 `k8sgame-save` JSON envelope is retained. Import validates
size, types, enum values, references, counts, and criteria before replacing play.
Current web saves can be imported; exports are accepted by the web game. Future
save versions are rejected rather than silently losing data.

Saves use app-private `Documents/k8sgame` (iOS) / `app_flutter/k8sgame` (Android).
Atomic temp-file replacement and a serialized write queue avoid partial or
out-of-order saves. Backgrounding pauses and saves immediately. Returning never
catches up elapsed time. A modal pause token prevents accidental resume after
backgrounding or importing a save.

System backups use platform facilities only. Android includes the save directory
in cloud/device-transfer backup rules. iOS Documents is eligible for OS backup.
Neither is guaranteed if disabled by the user. JSON export is the explicit backup.

Release Android manifests remove Internet/network-state permissions. There are no
network calls, telemetry SDKs, accounts, or remote assets in game code. Some
cross-platform libraries have transitive HTTP implementations for other platforms;
this app only invokes local file/asset APIs.

## Simulation parity and deliberate fixes

The first-ticket fixture compares nodes, images, services, RNG, economy and IDs
against the TypeScript engine. The longer campaign policy checks that the tree
remains winnable and avoids early death spirals.

Mobile fixes two source-engine edge cases: autoscaler additions reserve capacity
sequentially, preventing multiple services from consuming the same free slot;
the incident cap is checked after each generated incident. These can cause
long-running random streams to diverge from the browser while preserving rules
and save compatibility. Manual placement resizing leaves added replicas unplaced
until the player places them, with deployment blocked until complete.

Regenerate shared reference data from the repository root after intentional web changes:

```sh
node tools/mobile-fixtures.cjs
```

Regenerate sound effects from the repository root:

```sh
python3 tools/mobile-audio.py
```

Regenerate icons and actual-screen renders from this directory:

```sh
flutter test tool/capture_store_test.dart
```

The capture harness loads bundled fonts and Material Icons. Review every resulting
image before store upload. Screenshots are app renders without simulated OS chrome;
final device screenshots can be captured during release QA.
