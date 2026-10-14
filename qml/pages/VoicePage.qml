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
    property bool voiceDetails: false
    SettingsCard {
        Layout.fillWidth: true
        heading: "Voice notes"
        description: "Audio stays on this device."
        RowLayout {
            Layout.fillWidth: true
            Text {
                Layout.fillWidth: true
                text: "Translate voice notes"
                color: Tokens.ink
                font.pixelSize: 14
                wrapMode: Text.WordWrap
            }
            SK.Switch {
                objectName: "voiceTranslationSwitch"
                checked: !!root.settings.session.state.voice_enabled
                enabled: !root.settings.session.starting
                onToggled: root.settings.session.command("voice_enabled", {
                    enabled: checked
                })
                Accessible.name: "Enable voice-note translation"
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Text {
                Layout.fillWidth: true
                text: "Translate automatically"
                color: Tokens.ink
                font.pixelSize: 14
                wrapMode: Text.WordWrap
            }
            SK.Switch {
                objectName: "voiceAutomaticSwitch"
                checked: root.settings.session.state.voice_auto !== false
                enabled: !!root.settings.session.state.voice_enabled && !root.settings.session.starting
                onToggled: root.settings.session.command("voice_auto", {
                    enabled: checked
                })
                Accessible.name: "Automatically translate incoming voice notes"
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Text {
                Layout.fillWidth: true
                text: {
                    const speech = root.settings.session.state.speech || {};
                    return speech.downloading ? "Downloading… " + speech.progress + "%" : speech.ready ? "On-device model · Ready" : speech.error || "465 MB download when enabled";
                }
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
            }
            SK.Button {
                visible: !!root.settings.session.state.speech?.downloading
                text: "Cancel download"
                onClicked: root.settings.session.command("voice_enabled", {
                    enabled: false
                })
            }
            SK.Button {
                visible: root.voiceDetails && !!root.settings.session.state.voice_enabled && !root.settings.session.state.speech?.downloading
                text: root.settings.session.state.speech?.ready ? "Download again" : "Retry download"
                onClicked: root.settings.session.command("download_speech_model")
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Text {
                Layout.fillWidth: true
                text: "Maximum length"
                color: Tokens.ink
                font.pixelSize: 14
                wrapMode: Text.WordWrap
            }
            ChoiceBox {
                objectName: "voiceLengthChoice"
                Layout.preferredWidth: 180
                model: [5, 10, 20, 30].map(minutes => ({
                            label: minutes + " minutes",
                            minutes
                        }))
                textRole: "label"
                valueRole: "minutes"
                currentIndex: [5, 10, 20, 30].indexOf(root.settings.session.state.voice_max_minutes || 10)
                enabled: !root.settings.session.starting
                onActivated: root.settings.session.command("voice_max_minutes", {
                    minutes: currentValue
                })
                Accessible.name: "Maximum voice-note length"
            }
        }
        Text {
            Layout.fillWidth: true
            text: "Longer notes take more time and memory."
            color: Tokens.muted
            font.pixelSize: 12
            wrapMode: Text.WordWrap
        }
        SK.ToolButton {
            objectName: "voiceDetailsButton"
            text: root.voiceDetails ? "Hide details" : "Model and language details"
            onClicked: root.voiceDetails = !root.voiceDetails
        }
        ColumnLayout {
            objectName: "voiceDetails"
            visible: root.voiceDetails
            Layout.fillWidth: true
            spacing: 8
            Text {
                text: "Whisper · 465 MB · 99 transcription languages"
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            Text {
                text: "ChatGPT translates the text using your plan. Transcripts and translations are saved on this device."
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            Text {
                text: "Language is detected automatically. Use ⋯ on a voice note to choose another language. Cantonese and languages outside Whisper’s catalog support text translation."
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
        }
    }
}
