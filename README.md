# Wisp

WhatsApp conversations, without the language barrier.

[![Wisp demo — fictional conversation](docs/media/demo.gif)](docs/media/demo.mp4)

- Connect an eligible ChatGPT subscription.
- Choose from your account’s available models and thinking levels.
- Read translations inline and preview replies as you type.
- Keep URLs unchanged, with clickable translations and WhatsApp link previews. Link-only messages skip translation.
- Use the defaults or customize languages and tone with global or per-chat rules.
- Enable translation per chat. You decide when to send.
- Automatically detect source languages; choose from 100 presets or add a language and regional style for reading and replies.
- Optionally translate incoming voice notes automatically, with a manual mode, language detection and overrides, and the original transcript.

Wisp is free and uses your existing [eligible ChatGPT subscription](https://developers.openai.com/siwc/quickstart). No API key or separate API billing setup is needed; usage counts toward your plan allowance or available credits. In my own testing, I haven’t noticed a meaningful impact on usage.

Connect WhatsApp and ChatGPT, then enable translation for a chat. Credentials are protected by your operating system and saved translations stay local. Enabled chats send message text and recent context to OpenAI for translation.

Voice translation starts off. Enable it from a voice note or **App settings → Voice** to download the multilingual Whisper small model once (about 465 MB). Audio is transcribed locally; ChatGPT receives the transcript and recent text context. Incoming voice notes in the open chat translate automatically once enabled; turn automatic translation off to process notes on click. Translations appear inline beneath the native player, with a small collapse control, **Original** always visible, and source-language overrides, retry, and copy under **⋯**. Wisp follows WhatsApp’s live theme and uses neutral surfaces in dark mode. Transcripts and translations are saved on this device and restored when you return, including after an app restart. The model supports 99 transcription languages; Cantonese remains a text translation preset. Choose a maximum recording length of 5, 10, 20, or 30 minutes in Voice settings. The default is 10 minutes to keep memory use and wait times manageable.

Saved voice transcripts and translations reappear when you return to a chat or restart Wisp, without processing the recording again. The last source-language override is remembered. Changing the reading language reuses the original transcript for a new text translation. Clearing a chat's saved translations also clears its voice transcripts.

I built Wisp for my own use, and shared it in case it helps you too. It’s a small hobby project, issues and pull requests are welcome.

Published releases support macOS 14+. Windows x64 support is experimental, with portable ZIP packaging and builds included in the next release workflow; see the [Windows instructions](docs/development.md#windows). Linux sign-in storage is not implemented yet.

[Download](https://github.com/TimDurward/wisp/releases) · [Install](docs/development.md#install) · [Build](docs/development.md#build) · [Development](docs/development.md) · [License](LICENSE)

Wisp’s toolbar has two main actions: **Chat translation** controls the current chat; **App settings** holds defaults for all chats. Language defaults, Voice, chat behavior, rules, and your account have separate sections. Focus mode shows a **Show chats** action, and ChatGPT connection state and the signed-in email appear in Account settings.
