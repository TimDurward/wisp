import QtQuick

QtObject {
    id: root
    required property var desktop
    property bool whatsappLoading: false
    property var pendingFocus: null
    readonly property bool focusPending: pendingFocus !== null
    readonly property bool focusChat: focusPending ? pendingFocus : !!viewPreferences.focus_chat
    signal focusRequested(bool focused)
    readonly property var state: desktop.state
    readonly property bool starting: !state.initialized
    readonly property bool credentialsAvailable: state.credentials_available !== false
    readonly property bool connected: !!state.signed_in
    readonly property bool eligible: !!state.eligible
    readonly property bool modelBusy: !!state.models_busy
    readonly property bool accountBusy: starting || desktop.authBusy
    readonly property bool hasChat: !!state.conversation
    readonly property bool enabled: !!state.enabled
    readonly property bool ready: !!state.translation_ready
    readonly property bool hasRules: !!state.rules
    readonly property bool canToggle: hasChat && (enabled || ready || state.chat_cache_count > 0)
    readonly property bool canEditRules: hasChat && !starting
    readonly property var viewPreferences: state.view_preferences || ({
                                                                          reading_view:
                                                                          "translation_first",
                                                                          include_sent: true,
                                                                          live_preview: true,
                                                                          enter_prepares: true,
                                                                          focus_chat: false,
                                                                          original_on_hover: true
                                                                      })
    readonly property var translationPreferences: state.translation_preferences || ({
                                                                                        reading_language:
                                                                                        "english",
                                                                                        reply_language:
                                                                                        "spanish",
                                                                                        spanish_variant:
                                                                                        "peru",
                                                                                        global_rules:
                                                                                        ""
                                                                                    })
    readonly property int savedCount: (state.saved_count || 0) + (state.cache_count || 0)
    function languageLabel(id) {
        return (state.languages || []).find(item => item.id === id)?.label || "…";
    }
    readonly property string readingLabel: languageLabel(translationPreferences.reading_language)
    readonly property string replyLabel: languageLabel(translationPreferences.reply_language)
    readonly property string focusShortcut: Qt.platform.os === "osx" ? "⌘B" : "Ctrl+B"
    readonly property string settingsShortcut: Qt.platform.os === "osx" ? "⌘," : "Ctrl+,"
    readonly property string accountLabel: starting ? "Restoring your account…" : desktop.authBusy
                                                      ? "Connecting to ChatGPT…" : connected
                                                        && eligible ? "ChatGPT connected" :
                                                                      connected
                                                                      ? "ChatGPT plan access needed" :
                                                                        "Connect ChatGPT"
    readonly property string chatHint: {
        if (starting)
            return "Starting Wisp…";
        if (state.chat_detection === "unsupported_messages")
            return "Wisp could not read this chat. Reload WhatsApp to retry.";
        if (state.chat_detection === "ambiguous")
            return "Wisp could not identify this chat. Reload WhatsApp to retry.";
        if (state.chat_detection === "waiting_for_messages")
            return "Waiting for WhatsApp to load this chat…";
        if (!hasChat)
            return "Open a conversation to start translating";
        if (enabled && !ready)
            return "Saved translations available · Connect ChatGPT for new messages";
        if (desktop.authBusy)
            return "Finish signing in to ChatGPT in your browser";
        if (!eligible)
            return "Connect ChatGPT in Settings to translate this chat";
        if (modelBusy)
            return "Checking your available translation models…";
        if (!ready)
            return "Choose an available model in Settings";
        return enabled ? "Translation is on · Earlier messages translate as you scroll" :
                         "Turn on translation for this conversation";
    }
    function command(type, fields) {
        desktop.command(JSON.stringify(Object.assign({
                                                         type: type
                                                     }, fields || {})));
    }
    function setEnabled(value) {
        command("enable", {
                    enabled: value,
                    view_id: state.view_id
                });
    }
    function setPreference(key, value) {
        if (key === "focus_chat") {
            if (focusPending)
                return;
            pendingFocus = !!value;
            focusRequested(!!value);
        }
        let preferences = Object.assign({}, viewPreferences);
        preferences[key] = value;
        command("view_preferences", {
                    preferences: preferences
                });
    }
    onStateChanged: {
        if (focusPending && !!state.view_preferences?.focus_chat === pendingFocus)
            pendingFocus = null;
    }
    function rollbackFocus() {
        if (!focusPending)
            return;
        pendingFocus = null;
        focusRequested(!!viewPreferences.focus_chat);
    }
}
