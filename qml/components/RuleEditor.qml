import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"

ColumnLayout {
    id: root
    property alias text: editor.text
    property bool globalScope: false
    property int limit: 2000
    property int editorHeight: 160
    property bool suggestions: false
    readonly property int characterCount: Array.from(editor.text).length
    readonly property bool valid: characterCount <= limit
    spacing: 12
    function appendRule(rule) {
        if (!editor.text.includes(rule))
            editor.text = editor.text.trim() ? editor.text.trim() + "\n" + rule : rule;
        editor.forceActiveFocus();
    }
    SK.ToolButton {
        text: root.suggestions ? "Hide suggestions" : "Suggestions"
        onClicked: root.suggestions = !root.suggestions
    }
    Flow {
        visible: root.suggestions
        Layout.fillWidth: true
        spacing: 6
        SK.ToolButton {
            text: "Casual"
            onClicked: root.appendRule("Keep the tone casual and natural. Avoid overly formal wording.")
        }
        SK.ToolButton {
            text: "Formal"
            onClicked: root.appendRule("Use polite, formal language. Use usted in Spanish.")
        }
        SK.ToolButton {
            text: "No opening ¿ / ¡"
            onClicked: root.appendRule("In Spanish, omit opening ¿ and ¡ while keeping closing ? and !.")
        }
        SK.ToolButton {
            text: "Clear"
            enabled: !!editor.text
            onClicked: editor.text = ""
        }
    }
    PanelScrollView {
        id: inputScroll
        Layout.fillWidth: true
        Layout.preferredHeight: root.editorHeight
        SK.TextArea {
            id: editor
            objectName: root.globalScope ? "globalRulesEditor" : "rulesEditor"
            width: inputScroll.availableWidth
            height: Math.max(implicitHeight, inputScroll.availableHeight)
            font.pixelSize: 14
            placeholderText: root.globalScope ? "For example: Keep it casual. Preserve names and emojis." : "For example: Use usted with this contact. Keep product names in English."
            wrapMode: TextEdit.Wrap
            textFormat: TextEdit.PlainText
            selectByMouse: true
            Accessible.name: root.globalScope ? "Global translation rules" : "Chat translation rules"
        }
    }
    RowLayout {
        Layout.fillWidth: true
        Text {
            text: "Optional · Meaning stays the same"
            color: Tokens.muted
            font.pixelSize: 11
            Layout.fillWidth: true
        }
        Text {
            text: root.characterCount + " / " + root.limit
            color: root.valid ? Tokens.muted : Tokens.warning
            font.pixelSize: 11
        }
    }
}
