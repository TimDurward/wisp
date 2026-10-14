import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"
import "../components"

ColumnLayout {
    id: root
    required property var settings
    Layout.fillWidth: true
    spacing: 16
    SettingsCard {
        Layout.fillWidth: true
        heading: "Languages"
        description: "Source language is detected automatically."
        RowLayout {
            Layout.fillWidth: true
            spacing: 20
            ColumnLayout {
                Layout.fillWidth: true
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "Read messages in"
                        color: Tokens.muted
                        font.pixelSize: 12
                        Layout.fillWidth: true
                    }
                    SK.ToolButton {
                        text: "Add…"
                        enabled: !root.settings.session.starting && !root.settings.saving
                        onClicked: root.settings.openCustomLanguage("reading")
                        Accessible.name: "Add a reading language or region"
                    }
                }
                ChoiceBox {
                    objectName: "readingLanguageChoice"
                    Layout.fillWidth: true
                    model: root.settings.languages
                    textRole: "label"
                    valueRole: "id"
                    currentIndex: root.settings.languages.findIndex(item => item.id === root.settings.readingLanguage)
                    enabled: !root.settings.session.starting && !root.settings.saving
                    onActivated: root.settings.readingLanguage = currentValue
                    Accessible.name: "Reading language"
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "Write replies in"
                        color: Tokens.muted
                        font.pixelSize: 12
                        Layout.fillWidth: true
                    }
                    SK.ToolButton {
                        text: "Add…"
                        enabled: !root.settings.session.starting && !root.settings.saving
                        onClicked: root.settings.openCustomLanguage("reply")
                        Accessible.name: "Add a reply language or region"
                    }
                }
                ChoiceBox {
                    objectName: "replyLanguageChoice"
                    Layout.fillWidth: true
                    model: root.settings.languages
                    textRole: "label"
                    valueRole: "id"
                    currentIndex: root.settings.languages.findIndex(item => item.id === root.settings.replyLanguage)
                    enabled: !root.settings.session.starting && !root.settings.saving
                    onActivated: root.settings.replyLanguage = currentValue
                    Accessible.name: "Reply language"
                }
            }
        }
        RowLayout {
            visible: root.settings.readingLanguage === "spanish" || root.settings.replyLanguage === "spanish"
            Layout.fillWidth: true
            spacing: 20
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text {
                    text: "Spanish regional style"
                    color: Tokens.ink
                    font.pixelSize: 14
                }
                Text {
                    text: "Regional vocabulary and phrasing."
                    color: Tokens.muted
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
            ChoiceBox {
                Layout.preferredWidth: 220
                model: root.settings.variants
                textRole: "label"
                valueRole: "id"
                currentIndex: root.settings.variants.findIndex(item => item.id === root.settings.spanishVariant)
                enabled: !root.settings.session.starting && !root.settings.saving
                onActivated: root.settings.spanishVariant = currentValue
                Accessible.name: "Spanish regional style"
            }
        }
    }
    Text {
        text: "Applies to all translated chats."
        color: Tokens.muted
        font.pixelSize: 12
        wrapMode: Text.WordWrap
        lineHeight: 1.4
        Layout.fillWidth: true
    }
}
