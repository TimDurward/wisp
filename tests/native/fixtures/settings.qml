// Native controls regression fixture; no browser, account, or network.
import QtQuick
import Qt.labs.StyleKit as SK
import "../../../qml/components"
import "../../../qml/services"
import "../../../qml/theme"

SK.ApplicationWindow {
    id: window
    visible: true
    width: 960
    height: 660
    property bool captureDark: false
    SK.StyleKit.style: WispStyle {}
    QtObject {
        id: desktop
        property var state: ({
                initialized: true,
                enabled: false,
                conversation: "Contact",
                conversation_id: "chat-a",
                view_id: "view-a",
                rules: "",
                max_rules_chars: 2000,
                chat_cache_count: 0,
                voice_enabled: false,
                voice_auto: true,
                voice_max_minutes: 10,
                speech: {
                    ready: false,
                    downloading: false,
                    progress: 0,
                    error: ""
                },
                models: [],
                accounts: [],
                spanish_variants: [
                    {
                        id: "peru",
                        label: "Peru"
                    },
                    {
                        id: "neutral",
                        label: "Neutral"
                    },
                    {
                        id: "spain",
                        label: "Spain"
                    },
                    {
                        id: "mexico",
                        label: "Mexico"
                    }
                ],
                languages: [
                    {
                        id: "english",
                        label: "English"
                    },
                    {
                        id: "spanish",
                        label: "Spanish"
                    },
                    {
                        id: "portuguese",
                        label: "Portuguese"
                    },
                    {
                        id: "french",
                        label: "French"
                    },
                    {
                        id: "german",
                        label: "German"
                    },
                    {
                        id: "italian",
                        label: "Italian"
                    },
                    {
                        id: "japanese",
                        label: "Japanese"
                    },
                    {
                        id: "korean",
                        label: "Korean"
                    },
                    {
                        id: "chinese",
                        label: "Chinese"
                    },
                    {
                        id: "arabic",
                        label: "Arabic"
                    }
                ]
            })
        property string noticeKind: ""
        property string notice: ""
        property bool authBusy: false
        property int commands: 0
        property var lastCommand: ({})
        signal rulesSaved(string viewId)
        signal translationPreferencesSaved
        function command(payload) {
            commands++;
            lastCommand = JSON.parse(payload);
            if (lastCommand.type === "enable")
                state = Object.assign({}, state, {
                    enabled: lastCommand.enabled
                });
        }
    }
    Session {
        id: session
        desktop: desktop
    }
    header: Header {
        id: appHeader
        session: session
        iconRoot: Qt.resolvedUrl("../../../assets/icons/").toString()
        onSettingsRequested: settings.open()
        onTranslationRequested: dialog.openForCurrent()
    }
    ConnectionGuide {
        id: setupGuide
        objectName: "setupBanner"
        width: parent.width
        session: session
        visible: session.needsSetup || !session.hasChat
        onAccountRequested: settings.openPage(4)
    }
    RulesDialog {
        id: dialog
        session: session
        anchorItem: appHeader.translationAnchor
        onLanguagesRequested: settings.openPage(0)
        onAccountRequested: settings.openPage(4)
    }
    SettingsDialog {
        id: settings
        session: session
        iconRoot: Qt.resolvedUrl("../../../assets/icons/").toString()
    }
    ChoiceBox {
        id: edgeChoice
        objectName: "edgeChoice"
        visible: false
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 12
        width: 250
        model: desktop.state.languages
        textRole: "label"
    }
    function beginChoices(page) {
        settings.openPage(page);
    }
    function beginEdgeChoice() {
        edgeChoice.visible = true;
    }
    function resetFixture() {
        Tokens.browserDark = captureDark ? true : null;
        dialog.close();
        dialog.targetConversation = "";
        settings.close();
        settings.saving = false;
        edgeChoice.visible = false;
        window.width = 960;
        window.height = 660;
        desktop.commands = 0;
        desktop.authBusy = false;
        desktop.lastCommand = ({});
        desktop.state = Object.assign({}, desktop.state, {
            conversation_id: "chat-a",
            view_id: "view-a",
            rules: "",
            enabled: false,
            signed_in: false,
            initialized: true,
            credentials_available: true,
            models_busy: false,
            chat_cache_count: 0,
            translation_ready: false,
            eligible: false,
            accounts: [],
            account: null,
            voice_enabled: false,
            voice_auto: true,
            voice_max_minutes: 10,
            languages: desktop.state.languages.slice(0, 10)
        });
        settings.loadDraft();
    }
    function setupStage(stage) {
        desktop.authBusy = stage === "auth";
        desktop.state = Object.assign({}, desktop.state, {
            initialized: stage !== "starting",
            credentials_available: stage !== "unavailable",
            signed_in: ["plan", "models", "retry", "ready"].includes(stage),
            eligible: ["models", "retry", "ready"].includes(stage),
            models_busy: stage === "models",
            translation_ready: stage === "ready",
            chat_cache_count: stage === "cached" ? 2 : 0,
            enabled: false
        });
    }
    function beginSetup() {
        dialog.openForCurrent();
    }
    function beginCustomLanguage(target) {
        settings.openPage(0);
        settings.openCustomLanguage(target);
    }
    function finishLanguageAddition() {
        const value = {
            name: desktop.lastCommand.name,
            region: desktop.lastCommand.region
        };
        desktop.state = Object.assign({}, desktop.state, {
            languages: desktop.state.languages.concat([
                {
                    id: "custom:fixture",
                    label: value.region ? value.name + " · " + value.region : value.name,
                    value: value
                }
            ])
        });
    }
    function applyLanguages() {
        settings.apply();
    }
    function begin() {
        dialog.openForCurrent();
        dialog.rulesExpanded = true;
    }
    function beginTranslation() {
        desktop.state = Object.assign({}, desktop.state, {
            signed_in: true,
            eligible: true,
            translation_ready: true,
            translation_preferences: {
                reading_language: "english",
                reply_language: "spanish",
                spanish_variant: "peru",
                global_rules: ""
            }
        });
        dialog.openForCurrent();
    }
    function showAppPage(index) {
        settings.openPage(index);
    }
    function beginAccount() {
        desktop.state = Object.assign({}, desktop.state, {
            signed_in: true,
            eligible: true,
            translation_ready: true,
            account: "account-a",
            accounts: [
                {
                    client_id: "account-a",
                    email: "person@example.com"
                }
            ]
        });
        settings.advanced = false;
        settings.openPage(4);
    }
    function setAccount(account, signedIn) {
        desktop.state = Object.assign({}, desktop.state, {
            account: account,
            signed_in: signedIn,
            accounts: [
                {
                    client_id: "account-a",
                    email: "person@example.com"
                },
                {
                    client_id: "account-b",
                    email: "work@example.org"
                }
            ]
        });
    }
    function setFocus(focused) {
        desktop.state = Object.assign({}, desktop.state, {
            view_preferences: Object.assign({}, session.viewPreferences, {
                focus_chat: focused
            })
        });
    }
    function snapshot() {
        return {
            appPage: settings.currentPage,
            chatVisible: dialog.visible,
            globalVisible: settings.visible,
            customRulesVisible: dialog.rulesExpanded,
            showChats: appHeader.session.focusChat,
            headerHeight: appHeader.height,
            surface: Tokens.surface.toString(),
            ink: Tokens.ink.toString(),
            sameChat: dialog.sameChat,
            changed: dialog.changed,
            commands: desktop.commands,
            lastCommand: desktop.lastCommand,
            needsSetup: session.needsSetup,
            canToggle: session.canToggle
        };
    }
    function setAppearance(dark) {
        Tokens.browserDark = dark;
    }
    function replaceView() {
        desktop.state = Object.assign({}, desktop.state, {
            view_id: "view-b"
        });
    }
    function replaceChat() {
        desktop.state = Object.assign({}, desktop.state, {
            conversation_id: "chat-b",
            view_id: "view-c"
        });
    }
    function restoreChat() {
        desktop.state = Object.assign({}, desktop.state, {
            conversation_id: "chat-a",
            view_id: "view-b"
        });
    }
    function beginThinking() {
        dialog.close();
        desktop.state = Object.assign({}, desktop.state, {
            models: [
                {
                    slug: "gpt-6.1-sol",
                    display_name: "GPT-6.1 Sol"
                }
            ],
            model: "gpt-6.1-sol",
            models_busy: false,
            translation_ready: true,
            eligible: true,
            signed_in: true,
            accounts: [],
            reasoning_options: ["low", "medium", "high", "xhigh", "max"],
            reasoning_effort: null
        });
        settings.advanced = true;
        settings.openPage(4);
    }
}
