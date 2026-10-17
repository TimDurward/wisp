# Using Wisp

Download the app from [GitHub Releases](https://github.com/TimDurward/wisp/releases/latest) and follow the [installation instructions](development.md#install).

## Get started

1. Open Wisp and link WhatsApp by following the instructions in the app.
2. Choose **Connect ChatGPT** and finish signing in through your browser. You need an [eligible ChatGPT subscription](https://developers.openai.com/siwc/quickstart).
3. Open a WhatsApp conversation, choose **Chat translation** in the toolbar, and turn on **Translate this chat**.

Wisp uses your ChatGPT subscription, with no API key or separate API billing setup. Your plan's model access and usage limits apply. The setup guide explains when sign-in or model selection is still needed.

## Switching ChatGPT accounts

Open **App settings → Account** and choose **Use another account**. This is available after signing out too. Once connected, use the account picker to switch between saved accounts.

If your browser keeps choosing the previous ChatGPT login, choose **Copy sign-in link** in Wisp while the new account is connecting. Paste that link into a private or incognito window on the same computer, sign in with the account you want, and return to Wisp. Complete this within three minutes; if the attempt times out, start again for a fresh link. Signing out of Wisp does not sign you out of ChatGPT in your browser.

## Messages and replies

Translations appear inline as you read and scroll. Type a reply in your language and preview its translation before sending. You decide when to send.

For chats with translation enabled, the chat-list preview also shows a matching completed message translation. Hover over it to see the original. New messages keep their original preview until translated in the conversation; previews do not trigger extra translation requests. Turning translation off restores the native preview.

URLs stay unchanged, translated links remain clickable, and WhatsApp link previews are preserved. Link-only messages skip translation. Saved translations stay on this device and reappear when you return to a chat.

**Chat translation** controls the current conversation, including languages, rules, and saved history. **App settings** holds defaults for all chats, with Languages, Voice, Chat, Rules, and Account sections. Choose your model and thinking level in Account. Language detection is automatic; you can choose from 100 text-language presets or add a language and regional style.

Wisp follows WhatsApp's light or dark theme. Focus mode hides the chat list; choose **Show chats** to bring it back.

## Voice notes

Voice translation starts off. Enable it from a voice note or **App settings → Voice** to download the multilingual Whisper small model once, about 465 MB. Recordings are transcribed locally; ChatGPT receives the transcript and recent text context for translation.

After voice opt-in, incoming notes in the open chat are processed automatically as they become visible. Turn automatic translation off to process notes on click. Outgoing notes remain manual. Translations appear beneath the native player. **Original** shows the transcript; **⋯** holds language overrides, retry, and copy. The collapse control hides just the translation.

Transcripts, translations, and your last source-language override are saved locally and restored after returning to a chat or restarting Wisp. Changing the reading language reuses the original transcript for a new translation. Clearing a chat's saved translations also clears its transcripts.

The transcription model supports 99 languages. Cantonese is available as a text translation preset. Voice settings offers maximum recording lengths of 5, 10, 20, or 30 minutes; the default is 10 minutes to keep memory use and wait times manageable.

## Your data

Enabled chats send message text and recent context to OpenAI for translation. Voice audio is transcribed on this device. Credentials are protected by your operating system, and saved transcripts and translations stay local. Disabling translation or voice stops new processing without deleting saved results.
