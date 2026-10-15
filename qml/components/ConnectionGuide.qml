import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"

Rectangle {
    id: root
    required property var session
    property bool compact: false
    signal accountRequested
    objectName: "connectionGuide"
    implicitHeight: content.implicitHeight + 24
    color: Tokens.accentTint
    radius: compact ? Tokens.radius : 0
    ColumnLayout {
        id: content
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4
            Text {
                objectName: "connectionGuideTitle"
                text: root.session.needsSetup ? root.session.setupTitle : "Ready to translate"
                color: Tokens.ink
                font.pixelSize: 14
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            Text {
                text: root.session.needsSetup ? root.session.setupDetail : "Open a WhatsApp chat, then choose Chat translation in the toolbar and turn on Translate this chat."
                textFormat: Text.PlainText
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
        }
        SK.Button {
            objectName: "connectionGuideAction"
            text: root.session.setupAction
            visible: root.session.needsSetup && !!text
            enabled: !root.session.accountBusy && !root.session.modelBusy
            onClicked: {
                if (root.session.connected && !root.session.eligible)
                    root.accountRequested();
                else
                    root.session.continueSetup();
            }
        }
    }
}
