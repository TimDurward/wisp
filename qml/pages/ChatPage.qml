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
        heading: "Reading"
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: "Message display"
                color: Tokens.ink
                font.pixelSize: 14
                Layout.fillWidth: true
            }
            SK.ComboBox {
                Layout.preferredWidth: 250
                model: ["Translation first", "Both languages"]
                currentIndex: root.settings.session.viewPreferences.reading_view
                              === "both_languages" ? 1 : 0
                enabled: !root.settings.session.starting
                onActivated: root.settings.session.setPreference("reading_view", currentIndex === 1
                                                                 ? "both_languages" :
                                                                   "translation_first")
                Accessible.name: "Message display"
            }
        }
        PreferenceSwitch {
            Layout.fillWidth: true
            title: "Translate my sent messages"
            description: "Include your sent messages."
            checked: root.settings.session.viewPreferences.include_sent
            enabled: !root.settings.session.starting
            onToggled: value => root.settings.session.setPreference("include_sent", value)
        }
        PreferenceSwitch {
            Layout.fillWidth: true
            title: "Show originals on hover"
            description: "Click Original to keep it open."
            checked: root.settings.session.viewPreferences.original_on_hover
            enabled: !root.settings.session.starting
            onToggled: value => root.settings.session.setPreference("original_on_hover", value)
        }
    }
    SettingsCard {
        Layout.fillWidth: true
        heading: "Replies"
        PreferenceSwitch {
            Layout.fillWidth: true
            title: "Live translation previews"
            description: "Preview your reply after a short typing pause."
            checked: root.settings.session.viewPreferences.live_preview
            enabled: !root.settings.session.starting
            onToggled: value => root.settings.session.setPreference("live_preview", value)
        }
        PreferenceSwitch {
            Layout.fillWidth: true
            title: "Enter prepares the translation"
            description: "Enter prepares; Enter again sends. Shift+Enter adds a line."
            checked: root.settings.session.viewPreferences.enter_prepares
            enabled: !root.settings.session.starting
            onToggled: value => root.settings.session.setPreference("enter_prepares", value)
        }
    }
    SettingsCard {
        Layout.fillWidth: true
        heading: "Workspace"
        PreferenceSwitch {
            Layout.fillWidth: true
            title: "Focus on one chat"
            description: "Hide chats. Press " + root.settings.session.focusShortcut
                         + " to bring it back."
            checked: root.settings.session.focusChat
            enabled: !root.settings.session.starting && !root.settings.session.focusPending
            onToggled: value => root.settings.session.setPreference("focus_chat", value)
        }
        SK.ToolButton {
            text: "Chat preferences"
            enabled: root.settings.session.canEditRules
            onClicked: {
                root.settings.close();
                root.settings.rulesRequested();
            }
        }
    }
}
