import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

Rectangle {
    id: root
    required property var session
    signal settingsRequested
    signal languagesRequested
    signal rulesRequested
    implicitHeight: 54
    color: Tokens.surface
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        spacing: 10
        SK.ToolButton {
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            icon.source: "qrc:/wisp/assets/icons/sidebar.svg"
            icon.width: 20
            icon.height: 20
            icon.color: Tokens.ink
            checkable: true
            checked: root.session.focusChat
            enabled: !root.session.starting && !root.session.focusPending && (root.session.hasChat
                                                                              || root.session.focusChat)
            onClicked: root.session.setPreference("focus_chat", !root.session.focusChat)
            Accessible.name: root.session.focusChat ? "Show chat list" : "Hide chat list"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: root.session.focusChat ? "Show chat list · "
                                                     + root.session.focusShortcut :
                                                     "Focus on this chat · "
                                                     + root.session.focusShortcut
        }
        Image {
            source: "qrc:/wisp/assets/wisp.svg"
            sourceSize.width: 24
            sourceSize.height: 24
            Layout.preferredWidth: 24
            Layout.preferredHeight: 24
        }
        Text {
            text: "Wisp"
            color: Tokens.ink
            font.pixelSize: 19
            font.weight: Font.DemiBold
            font.letterSpacing: -0.4
        }
        SK.ToolButton {
            text: root.session.readingLabel + " → " + root.session.replyLabel
            font.pixelSize: 12
            enabled: !root.session.starting
            onClicked: root.languagesRequested()
            Accessible.name: "Translation languages"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: "Reading language → Reply language"
        }
        Item {
            Layout.fillWidth: true
        }
        SK.Switch {
            objectName: "conversationTranslationSwitch"
            text: "Translate chat"
            checked: root.session.enabled
            enabled: root.session.canToggle
            onClicked: root.session.setEnabled(checked)
            Accessible.name: "Translate the current conversation"
            Accessible.description: root.session.chatHint
        }
        SK.ToolButton {
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            icon.source: "qrc:/wisp/assets/icons/tune.svg"
            icon.width: 20
            icon.height: 20
            icon.color: Tokens.ink
            enabled: root.session.canEditRules
            onClicked: root.rulesRequested()
            Accessible.name: "Chat preferences"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: "Preferences for this chat" + (root.session.hasRules
                                                           ? " · Custom rules" : "")
            Rectangle {
                visible: root.session.hasRules
                width: 5
                height: 5
                radius: 3
                color: Tokens.accent
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 7
            }
        }
        SK.ToolButton {
            objectName: "settingsButton"
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            icon.source: "qrc:/wisp/assets/icons/settings.svg"
            icon.width: 20
            icon.height: 20
            icon.color: Tokens.ink
            onClicked: root.settingsRequested()
            Accessible.name: "Settings"
            T.ToolTip.visible: hovered
            T.ToolTip.delay: 400
            T.ToolTip.text: "Settings · " + root.session.settingsShortcut
        }
    }
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Tokens.line
    }
}
