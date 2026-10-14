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

Voice notes are optional and start disabled. A small MainWorld helper associates WhatsApp's detached audio player with the clicked note and returns its media URL through a nonce-bound message. It has no native channel, credentials, transcripts, or file access. ApplicationWorld validates the source, decodes audio to 16 kHz mono PCM, and transfers acknowledged, bounded chunks. The backend checks chat/view identity, opt-in, message anchors, ordering, duration, and cancellation before local transcription. View-once recordings are excluded.

`src/speech` uses whisper.cpp through whisper-rs. CPU support is portable across macOS, Windows, and Linux; Apple Silicon builds also use Metal, with a CPU fallback. The desktop app's current platform support remains macOS. `.cargo/config.toml` disables host-specific CPU tuning for distributable binaries. Whisper's multilingual small weights download asynchronously from a fixed public URL and are verified by size and SHA-256 before atomic installation. No model is downloaded or loaded at app startup. The default length limit is 10 minutes, configurable to 5, 10, 20, or 30; each job captures its limit when it starts. Original transcripts are cached locally per chat, note, model version, and language override. Clearing chat translations also clears that chat's transcripts; disabling voice keeps the downloaded model for later use.

The optional real-audio smoke test uses a disposable directory containing `spanish.pcm` (16 kHz mono signed 16-bit little endian). Set `WISP_TEST_SPEECH_DIR` to that directory and run `cargo test real_recording_detects_spanish -- --ignored`; this downloads the model if needed. Ordinary tests remain offline. ChatGPT translation prompts preserve uncertain wording and facts; they do not claim to recover missing audio.

Voice-note hydration uses a read-only, view-bound page request and checks that the note is among the current chat's message anchors. Completed voice translations are durable message history keyed by the source transcript and reading language, separate from the prompt cache. Restore needs neither model weights nor sign-in. Earlier prompt-cache entries migrate when their account/model/context key matches; legacy raw transcripts remain reusable. The latest manual source override is stored using hashed note identity. A changed reading language needs only a new text translation, and stale-view restore events are discarded.

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

## Install

Requires macOS 14 or later.

1. Download a ZIP from [GitHub Releases](https://github.com/TimDurward/wisp/releases). Choose `arm64` for Apple Silicon (M-series) or `x64` for Intel; Apple menu → **About This Mac** shows which you have.
2. Unzip it and drag **Wisp.app** to **Applications**.
3. Open Wisp from Applications.
4. If macOS says the developer cannot be verified or Apple cannot check the app, and you trust the download, open **System Settings → Privacy & Security → Open Anyway** for Wisp, then confirm **Open**.

These builds aren't Apple-notarized. Approval may be requested again after updates. [Apple's first-launch instructions](https://support.apple.com/en-us/102445) explain this app-specific exception.

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

Automatic voice processing is enabled by default only after voice opt-in. The frontend restores saved results first, then processes visible incoming notes sequentially. It does not download models automatically until the feature is explicitly enabled. Manual mode and outgoing notes remain click-driven. Failed jobs require explicit retry; cancellation and navigation stop pending work. A language override followed by Transcribe again bypasses the raw transcript cache without deleting the saved result until a replacement succeeds. Voice text shares the native player surface and intrinsic width; body-mounted top-layer popovers hold Original and the options so chat overflow cannot clip them.

The browser samples WhatsApp’s native surfaces when its root theme or stylesheet changes. Voice hosts temporarily remove Wisp paint while sampling, preventing stale colors from becoming their own source. Open popovers refresh too. A bounded appearance event carries only a light/dark flag to the native shell; it changes no stored settings, credentials, or chat state.

The Quiet Companion shell uses a 44px toolbar with chat translation and app settings as distinct entry points. The view-bound chat panel keeps activation, rules, and saved history scoped to its captured conversation. App settings use five sidebar sections: Languages, Voice, Chat, Rules, and Account. A blank initial browser URL supports an offline full-shell regression fixture; production starts at WhatsApp’s URL and retains its origin checks.
