# Wisp

WhatsApp conversations, without the language barrier.

[![Wisp demo — fictional conversation](docs/media/demo.gif)](docs/media/demo.mp4)

- Connect an eligible ChatGPT subscription.
- Choose from your account’s available models and thinking levels.
- Read translations inline and preview replies as you type.
- Use the defaults or customize languages and tone with global or per-chat rules.
- Enable translation per chat. You decide when to send.
- Automatically detect source languages; translate into English, Spanish, Portuguese, French, German, Italian, Japanese, Korean, Chinese, or Arabic.

Wisp is free and uses your existing [eligible ChatGPT subscription](https://developers.openai.com/siwc/quickstart). No API key or separate API billing setup is needed; usage counts toward your plan allowance or available credits. In my own testing, I haven’t noticed a meaningful impact on usage.

Connect WhatsApp and ChatGPT, then enable translation for a chat. Credentials stay in Keychain and saved translations stay local. Enabled chats send message text and recent context to OpenAI for translation.

I built Wisp for my own use, and shared it in case it helps you too. It’s a small hobby project, issues and pull requests are welcome.

Currently macOS 14+ only. If you’d like Windows or Linux support, open an issue; releases for other platforms can follow if there’s interest.

[Download](https://github.com/TimDurward/wisp/releases) · [Install](docs/development.md#install) · [Build for macOS](docs/development.md#build) · [Development](docs/development.md) · [License](LICENSE)
