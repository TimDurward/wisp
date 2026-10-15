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

`src/app` coordinates commands, accounts, and translation requests. Authentication, inference, storage, preferences, and protocol modules own their own rules. `src/desktop` transports events; desktop and webpage events have explicit destinations. `src/platform` owns credential storage through a shared `CredentialStore` interface. Keep new platform work there rather than adding OS branches to application logic.

On macOS, credentials remain in Keychain, including the existing migration and access-control behavior. On Windows, the entire OAuth record is encrypted using current-user DPAPI and saved atomically under the profile's `credentials/` directory. Windows Credential Manager has a 2560-byte secret limit, which is insufficient for some OAuth records. DPAPI ciphertext is bound to the account and profile identity; there is no plaintext or machine-wide fallback. Sign-out removes that account's encrypted file. Moving a profile to another Windows user or computer may require signing in again. Ordinary settings and cached translations remain local JSON, and WhatsApp manages its own persistent Qt WebEngine profile.

The narrow translation channel is the only native object exposed to WhatsApp, in WebEngine’s ApplicationWorld. Native settings and credentials never enter that channel. User-initiated draft preparation uses a completed, view-bound native ticket. Injected code never clicks Send or dispatches Enter.

Voice notes are optional and start disabled. A small MainWorld helper associates WhatsApp's detached audio player with the clicked note and returns its media URL through a nonce-bound message. It has no native channel, credentials, transcripts, or file access. ApplicationWorld validates the source, decodes audio offline to 16 kHz mono PCM without opening an audio output device, and transfers acknowledged, bounded chunks. The backend checks chat/view identity, opt-in, message anchors, ordering, duration, and cancellation before local transcription. View-once recordings are excluded.

`src/speech` uses whisper.cpp through whisper-rs. CPU support is portable across macOS, Windows, and Linux; Apple Silicon builds also use Metal, with a CPU fallback. Windows currently uses the CPU backend. `.cargo/config.toml` disables host-specific CPU tuning for distributable binaries. Whisper's multilingual small weights download asynchronously from a fixed public URL and are verified by size and SHA-256 before atomic installation. No model is downloaded or loaded at app startup. The default length limit is 10 minutes, configurable to 5, 10, 20, or 30; each job captures its limit when it starts. Original transcripts are cached locally per chat, note, model version, and language override. Clearing chat translations also clears that chat's transcripts; disabling voice keeps the downloaded model for later use.

The optional real-audio smoke test uses a disposable directory containing `spanish.pcm` (16 kHz mono signed 16-bit little endian). Set `WISP_TEST_SPEECH_DIR` to that directory and run `cargo test real_recording_detects_spanish -- --ignored`; this downloads the model if needed. Ordinary tests remain offline. ChatGPT translation prompts preserve uncertain wording and facts; they do not claim to recover missing audio.

Voice-note hydration uses a read-only, view-bound page request and checks that the note is among the current chat's message anchors. Completed voice translations are durable message history keyed by the source transcript and reading language, separate from the prompt cache. Restore needs neither model weights nor sign-in. Earlier prompt-cache entries migrate when their account/model/context key matches; legacy raw transcripts remain reusable. The latest manual source override is stored using hashed note identity. A changed reading language needs only a new text translation, and stale-view restore events are discarded.

DOM assumptions live in `web/src/whatsapp`. UI changes must be reversible because WhatsApp owns the document. Keep tests near the feature they cover, and use Playwright rather than spoofing trusted events.

Reading checks row visibility before reading message text, using child-bubble geometry for zero-height record wrappers. It reads the visible text and eight preceding text messages for context. Identity, visibility, edits, and cancellation are checked again before queued requests run. DOM record snapshots are shared within one synchronous scan and refreshed for each event. Voice detection starts with one query for audio markers instead of inspecting every text row separately.

The browser's immediate layout is an accessible pane. Preserve this boundary when changing the shell: Qt WebEngine checks only its immediate parent, and a parent/child mismatch can make Windows accessibility sibling navigation loop. Voice controls and saved transcripts are restored as notes enter the viewport; existing rows remain stable while scrolling, with at most 64 tracked controls. Voice context reads only the preceding eight text messages.

## macOS packaging

Packaging requires `cargo-about` (`brew install cargo-about`) to generate dependency notices. `npm run package:mac` stages, relocates, audits, and signs the bundle before replacing `dist/Wisp.app`. The previous bundle is retained while an open app may still use it. `--reuse-runtime` is for rebuilds with unchanged Qt modules and version; use a full build after changing Qt or imports.

Both packagers check `cargo-about` before compiling. Set `CARGO_ABOUT` to its executable path when using a custom tool installation; otherwise it is found on `PATH`.

`WISP_SIGNING_IDENTITY` selects an existing certificate. `--ad-hoc` is explicit local-development signing and may require renewed Keychain permission after rebuilding. An existing private `.wisp-signing/` identity is also reused when present. Packaging never creates certificate trust entries or changes OAuth item ACLs. The small C++ signing helper passes the build-keystore password over stdin and keeps it out of process arguments. It is not part of the app.

For the opt-in signing regression, set `WISP_TEST_SIGNING=1` and run `npx vitest run tools/tests/signing.test.ts`. It requires the existing local identity and uses only a disposable keychain with dummy values and dialogs disabled.

## Diagnostics

Use a fresh temporary `--data-dir` for smoke checks:

```sh
cargo run --locked -- --smoke --data-dir=/tmp/wisp-check --screenshot=/tmp/wisp.png
```

`--diagnostics` enables counts-only adapter reports. Geometry captures are saved as `focus-layout-collapsed.json` and `focus-layout-expanded.json`; they omit contact names, message text, image URLs, and credentials.

Geometry captures only run with `--diagnostics` or `--smoke`.

Qt StyleKit is a technology preview in Qt 6.11. Validate upgrades. Automated accessibility inspection crashes the tested Qt Cocoa backend, so authenticated app checks still require manual interaction. CI and fixture checks do not certify WhatsApp compatibility or live account eligibility.

## Install

### macOS

Requires macOS 14 or later.

1. Download a ZIP from [GitHub Releases](https://github.com/TimDurward/wisp/releases). Choose `arm64` for Apple Silicon (M-series) or `x64` for Intel; Apple menu → **About This Mac** shows which you have.
2. Unzip it and drag **Wisp.app** to **Applications**.
3. Open Wisp from Applications.
4. If macOS says the developer cannot be verified or Apple cannot check the app, and you trust the download, open **System Settings → Privacy & Security → Open Anyway** for Wisp, then confirm **Open**.

These builds aren't Apple-notarized. Approval may be requested again after updates. [Apple's first-launch instructions](https://support.apple.com/en-us/102445) explain this app-specific exception.

### Windows installation

1. Download the `windows-x64` ZIP from [GitHub Releases](https://github.com/TimDurward/wisp/releases/latest).
2. Extract it to a permanent folder. Keep the entire `Wisp-windows-x64` folder together.
3. Install the [Microsoft Visual C++ v14 x64 Redistributable](https://aka.ms/vc14/vc_redist.x64.exe) if needed.
4. Open **Wisp.exe**. You can create a shortcut to this executable.

Windows builds are experimental and unsigned. Rust, Node.js, and the Qt SDK are not needed to run the app. Settings and saved translations remain in your Windows user profile when replacing the app folder for an update; close Wisp before replacing it.

See [Using Wisp](usage.md) for connecting your accounts, translating chats, and enabling voice notes.

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

### Windows

The initial target is Windows x64 with Qt's MSVC 2022 build. Install:

- Node.js 24 or newer and stable Rust (`x86_64-pc-windows-msvc`).
- Visual Studio 2022 or Build Tools with **Desktop development with C++**, a Windows SDK, and **C++ Clang tools for Windows** (Whisper uses libclang during its build).
- CMake 3.24+ and Ninja on `PATH`.
- Qt 6.11.2 **MSVC 2022 64-bit**, including WebEngine, WebChannel, Positioning, and Shader Tools. StyleKit and SVG must also be present. MinGW Qt is not compatible with the Rust MSVC target.

Using the same Qt downloader revision as CI, a user-local SDK can be installed from PowerShell:

```powershell
python -m venv "$env:LOCALAPPDATA/wisp/build-tools"
& "$env:LOCALAPPDATA/wisp/build-tools/Scripts/python.exe" -m pip install 'aqtinstall @ git+https://github.com/miurahr/aqtinstall.git@076e1659807d0b362a3ed684d54c2e9c775eb9c7' cmake ninja
& "$env:LOCALAPPDATA/wisp/build-tools/Scripts/python.exe" -m aqt install-qt windows desktop 6.11.2 win64_msvc2022_64 --outputdir "$env:LOCALAPPDATA/wisp/Qt" --modules qtwebengine qtwebchannel qtpositioning qtshadertools
```

Then, from the repository root in PowerShell:

```powershell
. ./tools/windows/env.ps1
# For another Qt location: . ./tools/windows/env.ps1 -QtRoot C:/Qt/6.11.2/msvc2022_64
npm.cmd ci
cargo run --locked
```

The helper selects MSVC x64, sets `QMAKE`, and adds Qt's DLL directory and the user-local build tools to this shell's `PATH`. It changes no system environment settings. An extracted user-local MSVC/Windows SDK toolchain can be selected with `-MsvcRoot` or `WISP_MSVC_ROOT`; the default fallback is `%LOCALAPPDATA%/wisp/portable-toolchain/msvc`. `LIBCLANG_PATH` can override libclang discovery. Alternatively, `pip install libclang` in the build-tools environment provides a user-local copy that the helper detects. Run `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings`, and `npm.cmd run test:native` in that same shell. `npm.cmd` avoids PowerShell execution-policy restrictions on `npm.ps1`.

Windows Smart App Control can reject newly compiled Cargo build scripts with error 4551. This is an OS execution-policy block, not a missing dependency or a Wisp error. The setup helper does not change security settings; the machine owner must choose an appropriate development environment or policy. See [Microsoft's Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).

Qt selects the per-user application data path; use an explicit temporary profile for diagnostics:

```powershell
cargo run --locked -- --smoke "--data-dir=$env:TEMP/wisp-windows-check" "--screenshot=$env:TEMP/wisp-windows.png"
```

The shared Qt shell supplies Windows paths, browser launching, clipboard, native text input, and Ctrl-based shortcuts. Speech recognition uses the CPU backend; Metal remains a macOS optimization. The Windows release build uses the GUI subsystem to avoid a separate console window. The existing macOS bundle, signing, and archive scripts are separate deployment adapters.

To create a Windows app folder and a distributable ZIP, install `cargo-about` (`cargo install cargo-about --version 0.9.2 --locked --features cli`), then run:

```powershell
. ./tools/windows/env.ps1
npm.cmd run package:windows
npm.cmd run release:windows
./dist/Wisp-windows-x64/Wisp.exe
```

Packaging builds the release executable, generates Rust dependency notices, and runs the matching Qt SDK's `windeployqt` to include Qt DLLs, QML modules, and WebEngine helper/resources. It stages a fresh folder before replacing `dist/Wisp-windows-x64`, retains a previous build, and never includes a local profile, account, or model weights. Keep the entire folder together. The Microsoft Visual C++ v14 x64 Redistributable must be installed on the destination machine; `README.txt` links to Microsoft's installer. Compiler runtime DLLs from the development machine are not copied into the package. Local builds are unsigned; public distribution still needs signing and clean-machine validation.

`release:windows` audits the folder, rejects profile data and symbolic links, and creates `dist/Wisp-<version>-windows-x64.zip` plus its `.sha256` checksum. Extract the ZIP to a permanent location and open `Wisp.exe` inside `Wisp-windows-x64`; shortcuts can point to that executable. Installation does not require Rust, Node.js, or the Qt SDK. Updates replace the app folder while leaving the Windows user profile in place; close Wisp before replacing it.

Windows support is experimental. Local validation covers Rust credential/persistence tests, both Qt fixture suites, public-audio transcription, repeated voice decoding/transfer, and the packaged shell and Account settings with Qt's SDK paths removed from the environment. Display scaling, upgrades, and distribution on a clean machine still need validation before publishing Windows releases. The existing fixtures do not require accounts or send real messages.

## Releases

Update the version in `Cargo.toml`, regenerate `Cargo.lock` with Cargo, commit both, and push a matching tag such as `v0.0.1`. `.github/workflows/release.yml` tests and builds on separate macOS Apple Silicon, macOS Intel, and Windows x64 runners, bundles Qt, and publishes all three ZIP downloads with SHA-256 checksums. Every platform must succeed before a release is created. Assets upload to a draft first; the workflow publishes it as the latest normal release only after every upload succeeds. No local Keychain, profile, signing identity, or ChatGPT credential is used by the workflow.

For a local archive, run `npm run release:mac` or `npm.cmd run release:windows` after packaging. GitHub tags must match Cargo's version. Mac release builds are currently ad hoc signed, not Apple notarized; Developer ID signing/notarization needs a separate Apple distribution setup. Windows builds are unsigned. The private local signing identity used for development must never be uploaded as a release secret.

Before sharing source, stage the intended files and scan a source-only export with `gitleaks dir --redact`. `.gitignore` excludes local profiles, cached chats, environment files, and signing material. The README demo is an illustration with fictional messages and translations; it is not an account recording or a live inference request.

Automatic voice processing is enabled by default only after voice opt-in. The frontend restores saved results first, then processes visible incoming notes sequentially. It does not download models automatically until the feature is explicitly enabled. Manual mode and outgoing notes remain click-driven. Failed jobs require explicit retry; cancellation and navigation stop pending work. A language override followed by Transcribe again bypasses the raw transcript cache without deleting the saved result until a replacement succeeds. Voice text shares the native player surface and intrinsic width; body-mounted top-layer popovers hold Original and the options so chat overflow cannot clip them.

The browser samples WhatsApp’s native surfaces when its root theme or stylesheet changes. Voice hosts temporarily remove Wisp paint while sampling, preventing stale colors from becoming their own source. Open popovers refresh too. A bounded appearance event carries only a light/dark flag to the native shell; it changes no stored settings, credentials, or chat state.

The Quiet Companion shell uses a 44px toolbar with chat translation and app settings as distinct entry points. The view-bound chat panel keeps activation, rules, and saved history scoped to its captured conversation. App settings use five sidebar sections: Languages, Voice, Chat, Rules, and Account. A blank initial browser URL supports an offline full-shell regression fixture; production starts at WhatsApp’s URL and retains its origin checks.
