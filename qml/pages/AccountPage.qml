import QtQuick
import QtQuick.Layouts
import Qt.labs.StyleKit as SK
import "../theme"
import "../components"

ColumnLayout {
    id: root
    required property var settings
    readonly property var accounts: settings.session.state.accounts || []
    Layout.fillWidth: true
    spacing: 16
    SettingsCard {
        Layout.fillWidth: true
        heading: root.settings.session.accountLabel
        description: root.settings.session.connected && root.accounts.length > 1 ? "" : root.settings.session.accountEmail || (!root.settings.session.credentialsAvailable ? "Secure sign-in is not available on this platform yet." : "Uses your ChatGPT plan for new translations.")
        objectName: "accountConnectionCard"
        SK.Button {
            objectName: "accountConnectButton"
            visible: !root.settings.session.connected || !root.settings.session.eligible || (!root.settings.session.ready && !root.settings.session.modelBusy)
            text: root.settings.session.accountBusy ? "Connecting…" : root.settings.session.connected && root.settings.session.eligible ? "Refresh models" : "Continue with ChatGPT"
            enabled: root.settings.session.credentialsAvailable && !root.settings.session.accountBusy
            onClicked: root.settings.session.connected && root.settings.session.eligible ? root.settings.session.continueSetup() : root.settings.session.command("sign_in")
        }
        Text {
            visible: root.settings.session.needsSetup
            text: root.settings.session.setupDetail
            color: Tokens.muted
            font.pixelSize: 12
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
        ChoiceBox {
            objectName: "accountChoice"
            visible: root.accounts.length > 1
            Layout.fillWidth: true
            model: root.accounts.map((account, index) => ({
                        label: account.email + (root.accounts.filter(other => other.email === account.email).length > 1 ? " · Account " + (index + 1) : ""),
                        client_id: account.client_id
                    }))
            textRole: "label"
            valueRole: "client_id"
            currentIndex: root.accounts.findIndex(account => account.client_id === root.settings.session.state.account)
            enabled: !root.settings.session.accountBusy
            onActivated: root.settings.session.command("account", {
                client_id: currentValue
            })
            Accessible.name: "ChatGPT account"
        }
        RowLayout {
            Layout.fillWidth: true
            SK.ToolButton {
                text: "Manage plan usage ↗"
                onClicked: root.settings.session.desktop.openUsage()
            }
            Item {
                Layout.fillWidth: true
            }
            SK.ToolButton {
                visible: root.settings.session.connected
                text: "Add account"
                enabled: !root.settings.session.accountBusy
                onClicked: root.settings.session.command("sign_in", {
                    new_account: true
                })
            }
            SK.ToolButton {
                visible: root.settings.session.connected
                text: "Sign out"
                enabled: !root.settings.session.accountBusy
                onClicked: root.settings.session.command("sign_out")
            }
        }
        SK.ToolButton {
            text: root.settings.advanced ? "Hide model and thinking" : "Model and thinking"
            onClicked: root.settings.advanced = !root.settings.advanced
        }
        ColumnLayout {
            visible: root.settings.advanced
            Layout.fillWidth: true
            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: "Translation model"
                    color: Tokens.muted
                    font.pixelSize: 12
                    Layout.fillWidth: true
                }
                SK.ToolButton {
                    text: root.settings.session.modelBusy ? "Checking…" : "Refresh"
                    enabled: root.settings.session.eligible && !root.settings.session.accountBusy && !root.settings.session.modelBusy
                    onClicked: root.settings.session.command("refresh_models")
                }
            }
            ChoiceBox {
                Layout.fillWidth: true
                model: root.settings.session.state.models
                textRole: "display_name"
                valueRole: "slug"
                currentIndex: root.settings.session.state.models.findIndex(model => model.slug === root.settings.session.state.model)
                displayText: root.settings.session.modelBusy ? "Checking available models…" : count > 0 ? currentText : "Available after connecting"
                enabled: root.settings.session.ready && !root.settings.session.accountBusy && !root.settings.session.modelBusy
                onActivated: root.settings.session.command("model", {
                    slug: currentValue
                })
                Accessible.name: "Translation model"
            }
            Text {
                text: "Thinking level"
                color: Tokens.muted
                font.pixelSize: 12
            }
            ChoiceBox {
                Layout.fillWidth: true
                readonly property var choices: [
                    {
                        id: null,
                        label: "Automatic · Model default"
                    }
                ].concat((root.settings.session.state.reasoning_options || []).map(id => ({
                            id: id,
                            label: ({
                                    none: "None · Fastest",
                                    low: "Low · Faster replies",
                                    medium: "Medium · Balanced",
                                    high: "High · More deliberation",
                                    xhigh: "Extra high",
                                    max: "Maximum"
                                })[id]
                        })))
                objectName: "reasoningComboBox"
                model: choices
                textRole: "label"
                currentIndex: Math.max(0, choices.findIndex(choice => choice.id === (root.settings.session.state.reasoning_effort || null)))
                enabled: choices.length > 1 && root.settings.session.ready && !root.settings.session.accountBusy && !root.settings.session.modelBusy
                onActivated: root.settings.session.command("reasoning", {
                    slug: root.settings.session.state.model,
                    effort: choices[currentIndex].id
                })
                Accessible.name: "Thinking level"
            }
            Text {
                text: (root.settings.session.state.reasoning_options || []).length ? "Higher thinking levels can slow replies. Saved per model." : "Uses the model’s default thinking level."
                color: Tokens.muted
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
        }
    }
    SettingsCard {
        Layout.fillWidth: true
        heading: "Saved translations"
        description: "Stored locally until cleared. Draft previews expire after 30 days."
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: root.settings.session.savedCount + " saved items"
                color: Tokens.muted
                font.pixelSize: 12
                Layout.fillWidth: true
            }
            SK.ToolButton {
                text: "Clear saved translations"
                enabled: !root.settings.session.starting && root.settings.session.savedCount > 0
                onClicked: root.settings.session.command("clear_cache")
            }
        }
        Text {
            text: "Clear one chat from Chat translation."
            color: Tokens.muted
            font.pixelSize: 12
            Layout.fillWidth: true
        }
    }
    Text {
        text: "Enabled chats share text with ChatGPT. Sign-in is protected by your operating system."
        color: Tokens.muted
        font.pixelSize: 12
        wrapMode: Text.WordWrap
        lineHeight: 1.4
        Layout.fillWidth: true
    }
    RowLayout {
        Layout.fillWidth: true
        Text {
            text: "Wisp 0.1.0"
            color: Tokens.muted
            font.pixelSize: 11
            Layout.fillWidth: true
        }
        SK.ToolButton {
            text: "Reload WhatsApp"
            onClicked: {
                root.settings.close();
                root.settings.reloadRequested();
            }
        }
    }
}
