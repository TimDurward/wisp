// Full production shell with an offline browser and a temporary, empty profile.
import QtQuick
import "../../../qml" as Wisp
import "../../../qml/theme"

Wisp.Main {
    id: shell
    required property string fixtureRoot
    desktop: controller
    translationChannel: channel
    initialWhatsAppUrl: "about:blank"
    iconRoot: Qt.resolvedUrl("../../../assets/icons/").toString()
    QtObject {
        id: controller
        property string dataRoot: shell.fixtureRoot
        property string injectedScript: ""
        property string voiceSourceScript: ""
        property bool authBusy: false
        property bool canCopyAuthLink: false
        property bool diagnostics: false
        property bool focusShortcutEnabled: false
        property string notice: ""
        property string noticeKind: ""
        property var state: ({
                initialized: true,
                conversation: "Contact",
                conversation_id: "chat",
                view_id: "view",
                chat_detection: "ready",
                enabled: false,
                translation_ready: true,
                signed_in: true,
                eligible: true,
                accounts: [],
                models: [],
                rules: "",
                max_rules_chars: 2000,
                chat_cache_count: 0,
                voice_enabled: false,
                voice_auto: true,
                voice_max_minutes: 10,
                languages: [
                    {
                        id: "english",
                        label: "English"
                    },
                    {
                        id: "spanish",
                        label: "Spanish"
                    }
                ],
                spanish_variants: [
                    {
                        id: "peru",
                        label: "Peru"
                    }
                ]
            })
        signal appearanceChanged(bool dark)
        signal welcome
        signal rulesSaved(string viewId)
        signal translationPreferencesSaved
        signal draftEditRequested(string payload)
        signal focusShortcutRequested
        function command(payload) {
        }
        function clearNotice() {
        }
        function saveLayoutDiagnostic(payload) {
        }
        function isWhatsApp(url) {
            return false;
        }
        function openUsage() {
        }
        function openExternal(url) {
        }
        function commitDraft(id) {
            return false;
        }
    }
    QtObject {
        id: channel
        signal translationEvent(string payload)
        function submit(payload) {
        }
    }
    function openFixturePanel(name) {
        capturePanel(name);
    }
    function updateFixtureTheme(dark) {
        controller.appearanceChanged(dark);
    }
}
