import QtQuick
import QtQuick.Layouts
import "../theme"
import "../components"

ColumnLayout {
    id: root
    required property var settings
    property real viewportHeight: 400
    property alias rulesText: styleEditor.text
    readonly property bool rulesValid: styleEditor.valid
    Layout.fillWidth: true
    spacing: 12
    Text {
        text: "Translation rules"
        color: Tokens.ink
        font.pixelSize: 16
        font.weight: Font.Medium
    }
    Text {
        text: "Chat rules take priority."
        color: Tokens.muted
        font.pixelSize: 13
        wrapMode: Text.WordWrap
        lineHeight: 1.4
        Layout.fillWidth: true
    }
    RuleEditor {
        id: styleEditor
        Layout.fillWidth: true
        globalScope: true
        editorHeight: Math.max(100, Math.min(190, root.viewportHeight - 168))
        limit: root.settings.session.state.max_rules_chars || 2000
        enabled: !root.settings.session.starting && !root.settings.saving
    }
    Text {
        text: "Applies to new translations."
        color: Tokens.muted
        font.pixelSize: 12
        wrapMode: Text.WordWrap
        Layout.fillWidth: true
    }
}
