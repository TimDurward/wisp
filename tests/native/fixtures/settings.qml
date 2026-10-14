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
                                 models: [],
                                 accounts: []
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
        }
    }
    Session {
        id: session
        desktop: desktop
    }
    RulesDialog {
        id: dialog
        session: session
    }
    SettingsDialog {
        id: settings
        session: session
    }
    function resetFixture() {
        dialog.close();
        settings.close();
        desktop.commands = 0;
        desktop.lastCommand = ({});
        desktop.state = Object.assign({}, desktop.state, {
                                          conversation_id: "chat-a",
                                          view_id: "view-a",
                                          rules: ""
                                      });
    }
    function begin() {
        dialog.openForCurrent();
    }
    function snapshot() {
        return {
            sameChat: dialog.sameChat,
            changed: dialog.changed,
            commands: desktop.commands,
            lastCommand: desktop.lastCommand
        };
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
                                          reasoning_options: ["low", "medium", "high", "xhigh",
                                              "max"],
                                          reasoning_effort: null
                                      });
        settings.advanced = true;
        settings.openPage(3);
    }
}
