import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

SK.Popup {
    id: root
    objectName: "rulesDialog"
    required property var session
    property Item anchorItem: null
    signal languagesRequested
    signal accountRequested
    width: Math.min(380, parent.width - 32)
    height: Math.min(620, parent.height - 24, contentItem.implicitHeight + topPadding + bottomPadding)
    x: anchorItem ? Math.max(12, Math.min(parent.width - width - 12, anchorItem.mapToItem(parent, anchorItem.width, 0).x - width)) : (parent.width - width) / 2
    y: anchorItem ? Math.max(8, Math.min(parent.height - height - 12, anchorItem.mapToItem(parent, 0, anchorItem.height).y + 8)) : (parent.height - height) / 2
    padding: 18
    modal: false
    dim: false
    closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside
    property string targetView: ""
    property string targetConversation: ""
    property string targetTitle: ""
    property string originalRules: ""
    property bool targetEnabled: false
    property bool saving: false
    property bool rulesExpanded: false
    property bool savedExpanded: false
    readonly property bool sameChat: session.hasChat && !!targetConversation && targetConversation === session.state.conversation_id
    readonly property bool changed: editor.text.trim() !== originalRules.trim()
    function openForCurrent() {
        const conversation = session.canEditRules ? session.state.conversation_id || "" : "";
        const keepDraft = !!conversation && conversation === targetConversation && changed;
        targetView = session.canEditRules ? session.state.view_id : "";
        targetConversation = conversation;
        targetTitle = session.state.conversation || "No chat selected";
        targetEnabled = session.enabled;
        if (!keepDraft) {
            originalRules = session.state.rules || "";
            editor.text = originalRules;
        }
        saving = false;
        rulesExpanded = keepDraft;
        savedExpanded = false;
        open();
    }
    Connections {
        target: root.session.desktop
        function onRulesSaved(viewId) {
            if (root.saving && viewId === root.targetView) {
                root.originalRules = editor.text;
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
        spacing: 12
        RowLayout {
            Layout.fillWidth: true
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3
                Text {
                    text: root.rulesExpanded ? "Chat rules" : "Chat translation"
                    color: Tokens.ink
                    font.pixelSize: 17
                    font.weight: Font.Medium
                }
                Text {
                    text: root.targetTitle
                    textFormat: Text.PlainText
                    color: Tokens.muted
                    font.pixelSize: 12
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
            SK.ToolButton {
                text: "Done"
                onClicked: root.close()
                Accessible.name: "Close chat translation"
            }
        }
        PanelScrollView {
            id: form
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: formContent.implicitHeight
            ColumnLayout {
                id: formContent
                width: form.availableWidth
                spacing: 12
                RowLayout {
                    visible: !root.rulesExpanded
                    Layout.fillWidth: true
                    Text {
                        text: "Translate this chat"
                        color: Tokens.ink
                        font.pixelSize: 14
                        Layout.fillWidth: true
                    }
                    SK.Switch {
                        objectName: "conversationTranslationSwitch"
                        checked: root.sameChat ? root.session.enabled : root.targetEnabled
                        enabled: root.sameChat && root.session.canToggle
                        onClicked: root.session.setEnabled(checked)
                        Accessible.name: "Translate this chat"
                    }
                }
                Text {
                    visible: !root.rulesExpanded && (!root.sameChat || !root.session.ready)
                    text: !root.sameChat ? "Chat changed. Reopen Translation to continue." : root.session.chatHint
                    textFormat: Text.PlainText
                    color: root.sameChat ? Tokens.muted : Tokens.warning
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                SK.ToolButton {
                    visible: !root.rulesExpanded && root.sameChat && !root.session.ready
                    text: root.session.connected ? "Account and model" : "Connect ChatGPT"
                    onClicked: {
                        root.close();
                        root.accountRequested();
                    }
                }
                Rectangle {
                    visible: !root.rulesExpanded
                    color: Tokens.line
                    Layout.fillWidth: true
                    implicitHeight: 1
                }
                RowLayout {
                    visible: !root.rulesExpanded
                    Layout.fillWidth: true
                    spacing: 20
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3
                        Text {
                            text: "Read in"
                            color: Tokens.muted
                            font.pixelSize: 11
                        }
                        Text {
                            text: root.session.readingLabel
                            color: Tokens.ink
                            font.pixelSize: 14
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3
                        Text {
                            text: "Reply in"
                            color: Tokens.muted
                            font.pixelSize: 11
                        }
                        Text {
                            text: root.session.replyLabel
                            color: Tokens.ink
                            font.pixelSize: 14
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                    }
                }
                SK.ToolButton {
                    visible: !root.rulesExpanded
                    text: "Change app languages…"
                    font.pixelSize: 12
                    onClicked: {
                        root.close();
                        root.languagesRequested();
                    }
                    Accessible.description: "Changes language defaults for all chats"
                }
                SK.ToolButton {
                    objectName: "chatRulesDisclosure"
                    text: root.rulesExpanded ? "‹ Back to translation" : "Custom rules" + (root.changed ? " · Unsaved" : root.originalRules ? " · Set" : "")
                    Layout.fillWidth: true
                    onClicked: root.rulesExpanded = !root.rulesExpanded
                }
                ColumnLayout {
                    visible: root.rulesExpanded
                    Layout.fillWidth: true
                    spacing: 10
                    Text {
                        text: "Overrides app rules for this chat."
                        color: Tokens.muted
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }
                    RuleEditor {
                        id: editor
                        Layout.fillWidth: true
                        editorHeight: 130
                        limit: root.session.state.max_rules_chars || 2000
                        enabled: root.sameChat && !root.saving
                    }
                    SK.Button {
                        objectName: "rulesSaveButton"
                        text: root.saving ? "Saving…" : "Save rules"
                        Layout.alignment: Qt.AlignRight
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
                SK.ToolButton {
                    visible: !root.rulesExpanded
                    objectName: "chatSavedDisclosure"
                    text: root.savedExpanded ? "Hide saved translations" : "Saved translations"
                    Layout.fillWidth: true
                    onClicked: root.savedExpanded = !root.savedExpanded
                }
                ColumnLayout {
                    visible: root.savedExpanded && !root.rulesExpanded
                    Layout.fillWidth: true
                    Text {
                        text: (root.session.state.chat_cache_count || 0) + " saved for this chat"
                        color: Tokens.muted
                        font.pixelSize: 12
                    }
                    SK.ToolButton {
                        text: "Clear this chat’s translations"
                        enabled: root.sameChat && !root.saving && root.session.state.chat_cache_count > 0
                        onClicked: root.session.command("clear_chat_cache", {
                            view_id: root.session.state.view_id
                        })
                    }
                }
                Rectangle {
                    visible: !root.rulesExpanded
                    color: Tokens.line
                    Layout.fillWidth: true
                    implicitHeight: 1
                }
                SK.ToolButton {
                    visible: !root.rulesExpanded
                    text: root.session.focusChat ? "Show chats" : "Focus on this chat"
                    Layout.fillWidth: true
                    enabled: root.sameChat && !root.session.starting && !root.session.focusPending
                    onClicked: {
                        root.close();
                        root.session.setPreference("focus_chat", !root.session.focusChat);
                    }
                    Accessible.description: root.session.focusShortcut
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
            }
        }
    }
}
