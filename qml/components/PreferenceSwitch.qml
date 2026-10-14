import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"

RowLayout {
    id: root
    required property string title
    property string description: ""
    property bool checked: false
    signal toggled(bool value)
    spacing: 20
    ColumnLayout {
        Layout.fillWidth: true
        spacing: 4
        Text {
            text: root.title
            color: Tokens.ink
            font.pixelSize: 14
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
        Text {
            visible: !!root.description
            text: root.description
            color: Tokens.muted
            font.pixelSize: 12
            wrapMode: Text.WordWrap
            lineHeight: 1.3
            Layout.fillWidth: true
        }
    }
    SK.Switch {
        checked: root.checked
        onToggled: root.toggled(checked)
        Accessible.name: root.title
        Accessible.description: root.description
    }
}
