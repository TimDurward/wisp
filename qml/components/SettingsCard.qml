import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"

SK.Frame {
    id: root
    property string heading: ""
    property string description: ""
    default property alias content: rows.data
    padding: 18
    background: Rectangle {
        color: Tokens.surface
        radius: 12
        border.color: Tokens.line
    }
    contentItem: ColumnLayout {
        spacing: 12
        Text {
            visible: !!root.heading
            text: root.heading
            color: Tokens.ink
            font.pixelSize: 15
            font.weight: Font.DemiBold
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
        ColumnLayout {
            id: rows
            spacing: 16
            Layout.fillWidth: true
        }
    }
}
