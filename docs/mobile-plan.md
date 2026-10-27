# Mobile release plan

## Agreed product

- Name: Kubernetes: The Game. Developer: Mohammed Hussain.
- iOS bundle ID and Android application ID: `xyz.moohh.k8sthegame`.
- Paid download: US $0.99 (configure regional pricing in the stores); full game, no purchases, ads, accounts, leaderboards, telemetry, or backend.
- Flutter project in `mobile/`; preserve the React app and GitHub Pages deployment.
- Port all five repositories, four campaign tickets, six procedural request types, incidents, regressions, twelve upgrades, economy, events, win/loss, and endless play.
- Keep Daylight, Bubblegum, Voltage, original cluster logo, and workplace humor. Tap actions replace drag-and-drop.
- Phone and tablet, both orientations; adaptive navigation and list/detail layouts. Preserve edits on rotation.
- Beginner-friendly skippable first-ticket tutorial, contextual guidance, offline glossary. English initially, strings structured for localization.
- Standard difficulty, incident-frequency control, pause-on-ticket, 1/2/4× speed.
- Save and pause when backgrounded; explicit resume on return. No away-time simulation.
- Temporarily pause editing, help, tutorial, settings, and save management; restore prior state unless backgrounding or loading a save requires remaining paused.
- Autosave, three manual slots, validated web-compatible JSON transfers through native file/share interfaces.
- OS-managed backup only through straightforward platform defaults; no custom cloud integration.
- Bundled subtle effects, no music, independently configurable sound and haptics; visual equivalents, respect silent mode.
- Larger text, screen-reader labels, reduced motion, and non-color status cues.
- iOS 15+, Android 8+ subject to dependency compatibility. Current store target SDKs.
- Public support/privacy contact: moohh91@gmail.com.
- Privacy and support pages hosted with GitHub Pages, also readable offline in-app.
- Signing credentials stay with the owner. Deliver unsigned/development validation, signing instructions, store copy/art, screenshot artifacts, and release checklists.
- Feature branch from main; commit, push, PR for owner review. Owner merges and submits to stores.

## Implementation sequence

1. Audit existing engine and UI; record decisions and provision toolchain.
2. Port deterministic simulation and content to Dart. Add regression and cross-engine fixtures, including save interoperability and exploit prevention.
3. Build adaptive Flutter screens and lifecycle-safe persistence. Add onboarding, accessibility, effects, and platform integration.
4. Create original-logo icon variants, launch assets, actual-app screenshots, store metadata, privacy/support pages, and release documentation.
5. Run analysis, engine/widget/integration tests, web regression checks, platform builds where available, and visual QA. Document remaining owner-only checks explicitly.
6. Commit and push the feature branch. The owner will create the PR; no browser actions are needed.

## Initial environment observations

The working tree started clean on `main`. Flutter/Dart were absent from PATH. Xcode command-line tools are installed, but full Xcode and the standard Android SDK directory are absent. Native build verification must not be reported as passed until tools are installed and actual builds complete.
