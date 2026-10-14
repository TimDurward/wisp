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
        heading: "Translation languages"
        description: "Source language is detected automatically."
        RowLayout {
            Layout.fillWidth: true
            spacing: 20
            ColumnLayout {
                Layout.fillWidth: true
                Text {
                    text: "Read messages in"
                    color: Tokens.muted
                    font.pixelSize: 12
                }
                SK.ComboBox {
                    Layout.fillWidth: true
                    model: root.settings.languages
                    textRole: "label"
                    valueRole: "id"
                    currentIndex: root.settings.languages.findIndex(item => item.id
                                                                            === root.settings.readingLanguage)
                    enabled: !root.settings.session.starting && !root.settings.saving
                    onActivated: root.settings.readingLanguage = currentValue
                    Accessible.name: "Reading language"
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text {
                    text: "Write replies in"
                    color: Tokens.muted
                    font.pixelSize: 12
                }
                SK.ComboBox {
                    Layout.fillWidth: true
                    model: root.settings.languages
                    textRole: "label"
                    valueRole: "id"
                    currentIndex: root.settings.languages.findIndex(item => item.id
                                                                            === root.settings.replyLanguage)
                    enabled: !root.settings.session.starting && !root.settings.saving
                    onActivated: root.settings.replyLanguage = currentValue
                    Accessible.name: "Reply language"
                }
            }
        }
        RowLayout {
            visible: root.settings.readingLanguage === "spanish" || root.settings.replyLanguage
                     === "spanish"
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
            SK.ComboBox {
                Layout.preferredWidth: 220
                model: root.settings.variants
                textRole: "label"
                valueRole: "id"
                currentIndex: root.settings.variants.findIndex(item => item.id
                                                                       === root.settings.spanishVariant)
                enabled: !root.settings.session.starting && !root.settings.saving
                onActivated: root.settings.spanishVariant = currentValue
                Accessible.name: "Spanish regional style"
            }
        }
    }
    Text {
        text: "Defaults for enabled chats."
        color: Tokens.muted
        font.pixelSize: 12
        wrapMode: Text.WordWrap
        lineHeight: 1.4
        Layout.fillWidth: true
    }
}
