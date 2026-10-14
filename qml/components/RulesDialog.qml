import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

SK.Popup {
    id: root
    objectName: "rulesDialog"
    required property var session
    anchors.centerIn: parent
    width: Math.min(560, parent.width - 40)
    height: Math.min(600, parent.height - 32)
    padding: 24
    modal: true
    dim: true
    T.Overlay.modal: Rectangle {
        color: "#66000000"
    }
    property string targetView: ""
    property string targetConversation: ""
    property string targetTitle: ""
    property string originalRules: ""
    property bool saving: false
    readonly property bool sameChat: session.hasChat && !!targetConversation && targetConversation
                                     === session.state.conversation_id
    readonly property bool changed: editor.text.trim() !== originalRules.trim()
    function openForCurrent() {
        targetView = session.canEditRules ? session.state.view_id : "";
        targetConversation = session.canEditRules ? session.state.conversation_id || "" : "";
        targetTitle = session.state.conversation || "No chat selected";
        originalRules = session.state.rules || "";
        editor.text = originalRules;
        saving = false;
        open();
    }
    Connections {
        target: root.session.desktop
        function onRulesSaved(viewId) {
            if (viewId === root.targetView) {
                root.saving = false;
                root.close();
            }
        }
        function onNoticeChanged() {
            if (root.session.desktop.noticeKind === "error")
                root.saving = false;
        }
    }
    contentItem: ColumnLayout {
        spacing: 16
        RowLayout {
            Layout.fillWidth: true
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text {
                    text: "Chat preferences"
                    color: Tokens.ink
                    font.pixelSize: 23
                    font.weight: Font.DemiBold
                }
                Text {
                    text: root.targetTitle
                    textFormat: Text.PlainText
                    color: Tokens.muted
                    font.pixelSize: 13
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
            SK.ToolButton {
                text: "Done"
                onClicked: root.close()
            }
        }
        Rectangle {
            color: Tokens.line
            Layout.fillWidth: true
            implicitHeight: 1
        }
        PanelScrollView {
            id: form
            Layout.fillWidth: true
            Layout.fillHeight: true
            ColumnLayout {
                width: form.availableWidth
                spacing: 16
                Text {
                    text: "Rules for this conversation"
                    color: Tokens.ink
                    font.pixelSize: 15
                    font.weight: Font.DemiBold
                }
                Text {
                    text: "These preferences override your global style rules. Language defaults still come from Settings."
                    color: Tokens.muted
                    font.pixelSize: 13
                    wrapMode: Text.WordWrap
                    lineHeight: 1.4
                    Layout.fillWidth: true
                }
                RuleEditor {
                    id: editor
                    Layout.fillWidth: true
                    editorHeight: 150
                    limit: root.session.state.max_rules_chars || 2000
                    enabled: root.sameChat && !root.saving
                }
                Text {
                    text: root.sameChat
                          ? "New messages use these rules. Saved translations stay until you clear them." :
                            "The selected chat changed. Reopen its preferences to edit rules."
                    color: root.sameChat ? Tokens.muted : Tokens.warning
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                Text {
                    visible: root.session.desktop.noticeKind === "error"
                    text: root.session.desktop.notice || ""
                    textFormat: Text.PlainText
                    color: Tokens.warning
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                SK.ToolButton {
                    text: "Clear this chat’s saved translations (" + (
                              root.session.state.chat_cache_count || 0) + ")"
                    enabled: root.sameChat && !root.saving && root.session.state.chat_cache_count
                             > 0

                    onClicked: root.session.command("clear_chat_cache", {
                                                        view_id: root.session.state.view_id
                                                    })
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: root.changed ? "Unsaved changes · Only this chat" : "Only this chat"
                color: root.changed ? Tokens.warning : Tokens.muted
                font.pixelSize: 11
                Layout.fillWidth: true
            }
            SK.Button {
                objectName: "rulesSaveButton"
                text: root.saving ? "Saving…" : "Save rules"
                enabled: root.sameChat && editor.valid && !root.saving
                onClicked: {
                    root.targetView = root.session.state.view_id;
                    root.saving = true;
                    root.session.command("rules", {
                                             view_id: root.targetView,
                                             rules: editor.text
                                         });
                }
            }
        }
    }
}
