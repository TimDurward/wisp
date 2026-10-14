# Development

The desktop app uses Cargo and CXX-Qt. Cargo rebuilds the bundled web assets with esbuild when TypeScript or CSS changes. Run `npm ci` first; the packaged app has no Node.js runtime dependency.

## Checks

- `npm run check:web` — strict TypeScript checking
- `npm run check:tools` — packaging-tool type checking
- `npm run check:tests` — strict TypeScript checking for test fixtures and scenarios
- `npm run format:check` — Prettier; native C++ uses `.clang-format`, QML uses Qt’s `qmlformat`
- `npm test` — Vitest; isolated DOM fixtures and per-window fake clocks
- `npm run test:browser` — Playwright; real keyboard/pointer events with intercepted local pages
- `npm run test:native` — CMake, CTest, and Qt Test; offscreen fixtures
- `cargo test --locked` and `cargo clippy --all-targets --locked -- -D warnings`

Install the test browser once with `npx playwright install chromium`. Native tests require CMake and the same Qt installation as the app. Set `QMAKE` to the absolute path of the SDK's qmake executable.

Tests never log in or send real messages. Browser tests exercise the production bundle with a native-channel test double. Qt tests verify native input, shortcuts, layout, and settings controls. Rust tests cover request validation, cancellation, identity, persistence, authentication claims, and stream completion.

## Boundaries

`src/app` coordinates commands, accounts, and translation requests. Authentication, inference, storage, preferences, and protocol modules own their own rules. `src/desktop` transports events; desktop and webpage events have explicit destinations. `src/platform` owns credential storage. Keep new platform work there rather than adding OS branches to application logic.

The narrow translation channel is the only native object exposed to WhatsApp, in WebEngine’s ApplicationWorld. Native settings and credentials never enter that channel. User-initiated draft preparation uses a completed, view-bound native ticket. Injected code never clicks Send or dispatches Enter.

DOM assumptions live in `web/src/whatsapp`. UI changes must be reversible because WhatsApp owns the document. Keep tests near the feature they cover, and use Playwright rather than spoofing trusted events.

## macOS packaging

Packaging requires `cargo-about` (`brew install cargo-about`) to generate dependency notices. `npm run package:mac` stages, relocates, audits, and signs the bundle before replacing `dist/Wisp.app`. The previous bundle is retained while an open app may still use it. `--reuse-runtime` is for rebuilds with unchanged Qt modules and version; use a full build after changing Qt or imports.

`WISP_SIGNING_IDENTITY` selects an existing certificate. `--ad-hoc` is explicit local-development signing and may require renewed Keychain permission after rebuilding. An existing private `.wisp-signing/` identity is also reused when present. Packaging never creates certificate trust entries or changes OAuth item ACLs. The small C++ signing helper passes the build-keystore password over stdin and keeps it out of process arguments. It is not part of the app.

For the opt-in signing regression, set `WISP_TEST_SIGNING=1` and run `npx vitest run tools/tests/signing.test.ts`. It requires the existing local identity and uses only a disposable keychain with dummy values and dialogs disabled.

## Diagnostics

Use a fresh temporary `--data-dir` for smoke checks:

```sh
cargo run --locked -- --smoke --data-dir=/tmp/wisp-check --screenshot=/tmp/wisp.png
```

`--diagnostics` enables counts-only adapter reports. Geometry captures are saved as `focus-layout-collapsed.json` and `focus-layout-expanded.json`; they omit contact names, message text, image URLs, and credentials.

Qt StyleKit is a technology preview in Qt 6.11. Validate upgrades. Automated accessibility inspection crashes the tested Qt Cocoa backend, so authenticated app checks still require manual interaction. CI and fixture checks do not certify WhatsApp compatibility or live account eligibility.

## Build

On macOS, install Xcode Command Line Tools and Rust (rustup), then:

```sh
brew install node@24 cmake qt
export PATH="$(brew --prefix node@24)/bin:$PATH"
export QMAKE="$(command -v qmake6)"
npm ci
cargo run --locked
```

Use Qt 6.11.2 (the CI version), with WebEngine, WebChannel, StyleKit, and SVG; Homebrew's `qt` can move ahead. With the Qt Online Installer, install the same modules as CI and set `QMAKE` to that SDK's `bin/qmake`. CXX-Qt and the packaging tools query that executable. Native tests build their own web fixtures and need no account or prior app run.

## Releases

Update the version in `Cargo.toml`, regenerate `Cargo.lock` with Cargo, commit both, and push a matching tag such as `v0.1.0`. `.github/workflows/release.yml` tests and builds on separate Apple Silicon and Intel runners, bundles Qt, and creates ZIP downloads with SHA-256 checksums in a **draft GitHub release**. Review the draft and publish it from GitHub. No local Keychain, profile, signing identity, or ChatGPT credential is used by the workflow.

For a local archive, run `npm run release:mac` after packaging. GitHub tags must match Cargo's version. Release builds are currently ad hoc signed, not Apple notarized; Developer ID signing/notarization needs a separate Apple distribution setup. The private local signing identity used for development must never be uploaded as a release secret.

Before sharing source, stage the intended files and scan a source-only export with `gitleaks dir --redact`. `.gitignore` excludes local profiles, cached chats, environment files, and signing material. The README demo is an illustration with fictional messages and translations; it is not an account recording or a live inference request.
