import QtQuick
import QtQuick.Layouts
import "../theme"

Rectangle {
    id: root
    required property var session
    signal settingsRequested
    height: 26
    color: Tokens.surface
    Rectangle {
        width: parent.width
        height: 1
        color: Tokens.line
    }
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 22
        anchors.rightMargin: 22
        spacing: 8
        Rectangle {
            implicitWidth: 6
            implicitHeight: 6
            radius: 3
            color: root.session.ready ? Tokens.accent : Tokens.muted
        }
        Text {
            text: root.session.accountLabel
            color: Tokens.muted
            font.pixelSize: 11
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.settingsRequested()
            }
        }
        Item {
            Layout.fillWidth: true
        }
        Text {
            text: root.session.whatsappLoading ? "Connecting to WhatsApp…" : root.session.ready
                                                 && root.session.enabled ? "Translation on" :
                                                                           root.session.chatHint
            color: Tokens.muted
            font.pixelSize: 11
            elide: Text.ElideRight
            Layout.maximumWidth: parent.width * 0.62
        }
    }
}
