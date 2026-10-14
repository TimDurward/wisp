import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

Rectangle {
    id: root
    required property var session
    property string iconRoot: "qrc:/wisp/assets/icons/"
    property alias translationAnchor: translationButton
    signal settingsRequested
    signal translationRequested
    implicitHeight: 44
    color: Tokens.surface
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        spacing: 10
        SK.ToolButton {
            objectName: "showChatsButton"
            visible: root.session.focusChat
            text: "Show chats"
            font.pixelSize: 12
            icon.source: root.iconRoot + "arrow-left.svg"
            icon.width: 15
            icon.height: 15
            icon.color: Tokens.ink
            enabled: !root.session.starting && !root.session.focusPending
            onClicked: root.session.setPreference("focus_chat", false)
            Accessible.name: "Show chat list"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: "Show chats · " + root.session.focusShortcut
        }
        Item {
            Layout.fillWidth: true
        }
        SK.ToolButton {
            id: translationButton
            objectName: "chatTranslationButton"
            text: "Chat translation" + (root.session.hasChat ? root.session.enabled ? " · On" : " · Off" : "")
            font.pixelSize: 12
            rightPadding: 28
            icon.source: root.iconRoot + "languages.svg"
            icon.width: 17
            icon.height: 17
            icon.color: root.session.enabled ? Tokens.accent : Tokens.ink
            enabled: root.session.hasChat && !root.session.starting
            onClicked: root.translationRequested()
            Accessible.name: "Translation for this chat"
            Accessible.description: root.session.chatHint
            background: Rectangle {
                radius: 6
                color: translationButton.hovered ? Tokens.raised : root.session.enabled ? Tokens.accentTint : Qt.alpha(Tokens.raised, 0)
            }
            SK.ToolButton {
                width: 20
                height: 20
                padding: 0
                enabled: false
                Accessible.ignored: true
                icon.source: root.iconRoot + "chevron-down.svg"
                icon.width: 12
                icon.height: 12
                icon.color: Tokens.muted
                background: null
                anchors.right: parent.right
                anchors.rightMargin: 5
                anchors.verticalCenter: parent.verticalCenter
            }
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: root.session.hasChat ? "Translation and rules for " + root.session.state.conversation : "Open a chat to start translating"
        }
        SK.ToolButton {
            objectName: "settingsButton"
            text: "App settings"
            font.pixelSize: 12
            icon.source: root.iconRoot + "settings.svg"
            icon.width: 17
            icon.height: 17
            icon.color: Tokens.ink
            onClicked: root.settingsRequested()
            Accessible.name: "App settings"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: "Defaults for all chats · " + root.session.settingsShortcut
        }
    }
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Tokens.line
    }
    SK.ProgressBar {
        visible: root.session.whatsappLoading
        anchors.bottom: parent.bottom
        width: parent.width
        indeterminate: true
        Accessible.name: "Loading WhatsApp"
    }
}
