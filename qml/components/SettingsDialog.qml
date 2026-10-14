import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"
import "../pages"

SK.Popup {
    id: root
    objectName: "settingsDialog"
    required property var session
    signal reloadRequested
    anchors.centerIn: parent
    width: Math.min(740, parent.width - 32)
    height: Math.min(620, parent.height - 24)
    padding: 0
    // StyleKit supplies individual paddings, so override those too. Keep only
    // the outer border inset; the sidebar and dividers meet the panel edges.
    leftPadding: 1
    rightPadding: 1
    topPadding: 1
    bottomPadding: 1
    modal: true
    dim: true
    T.Overlay.modal: Rectangle {
        color: "#66000000"
    }
    property var original: ({
            reading_language: "english",
            reply_language: "spanish",
            spanish_variant: "peru",
            global_rules: ""
        })
    property string readingLanguage: "english"
    property string replyLanguage: "spanish"
    property string spanishVariant: "peru"
    property bool saving: false
    property bool advanced: false
    property int currentPage: 0
    property string iconRoot: "qrc:/wisp/assets/icons/"
    property string customLanguageTarget: "reply"
    readonly property var languages: session.state.languages || []
    readonly property var variants: session.state.spanish_variants || []
    readonly property bool changed: readingLanguage !== original.reading_language || replyLanguage !== original.reply_language || spanishVariant !== original.spanish_variant || stylePage.rulesText.replace(/\r\n/g, "\n").trim() !== original.global_rules.trim()
    function loadDraft() {
        original = Object.assign({}, session.translationPreferences);
        readingLanguage = original.reading_language;
        replyLanguage = original.reply_language;
        spanishVariant = original.spanish_variant;
        stylePage.rulesText = original.global_rules;
    }
    function openPage(index) {
        currentPage = index;
        open();
    }
    function openReading() {
        openPage(2);
    }
    function openCustomLanguage(target) {
        customLanguageTarget = target;
        customLanguage.open();
    }
    function languageValue(id) {
        return languages.find(item => item.id === id)?.value || id;
    }
    function apply() {
        saving = true;
        session.command("translation_preferences", {
            preferences: {
                reading_language: languageValue(readingLanguage),
                reply_language: languageValue(replyLanguage),
                spanish_variant: spanishVariant,
                global_rules: stylePage.rulesText
            }
        });
    }
    onAboutToHide: customLanguage.close()
    CustomLanguageDialog {
        id: customLanguage
        parent: root.parent
        session: root.session
        languages: root.languages
        onLanguageSaved: languageId => {
            const target = root.customLanguageTarget;
            // Wait for the ComboBox models to include the new choice.
            Qt.callLater(() => {
                if (target === "reading")
                    root.readingLanguage = languageId;
                else
                    root.replyLanguage = languageId;
            });
        }
    }
    onAboutToShow: {
        if (!changed && !saving)
            loadDraft();
    }
    Connections {
        target: root.session
        function onStateChanged() {
            const incoming = root.session.translationPreferences;
            if (!root.changed && !root.saving && (incoming.reading_language !== root.original.reading_language || incoming.reply_language !== root.original.reply_language || incoming.spanish_variant !== root.original.spanish_variant || incoming.global_rules !== root.original.global_rules))
                root.loadDraft();
        }
    }
    Connections {
        target: root.session.desktop
        function onTranslationPreferencesSaved() {
            root.original = {
                reading_language: root.readingLanguage,
                reply_language: root.replyLanguage,
                spanish_variant: root.spanishVariant,
                global_rules: stylePage.rulesText.replace(/\r\n/g, "\n").trim()
            };
            root.saving = false;
        }
        function onNoticeChanged() {
            if (root.session.desktop.noticeKind === "error")
                root.saving = false;
        }
    }
    onCurrentPageChanged: {
        const flickable = scroll.contentItem as Flickable;
        if (flickable)
            flickable.contentY = 0;
    }
    contentItem: ColumnLayout {
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: 20
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3
                Text {
                    text: "App settings"
                    Layout.fillWidth: true
                    color: Tokens.ink
                    font.pixelSize: 20
                    font.weight: Font.Medium
                }
                Text {
                    text: "Defaults for all chats"
                    Layout.fillWidth: true
                    color: Tokens.muted
                    font.pixelSize: 12
                }
            }
            SK.ToolButton {
                objectName: "closeAppSettings"
                text: "Done"
                onClicked: root.close()
                Accessible.name: "Close app settings"
            }
        }
        Rectangle {
            objectName: "settingsHeaderDivider"
            Layout.fillWidth: true
            implicitHeight: 1
            color: Tokens.line
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            Rectangle {
                objectName: "settingsSidebar"
                Layout.preferredWidth: 148
                Layout.fillHeight: true
                color: Tokens.canvas
                bottomLeftRadius: Tokens.radius - 1
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 4
                    Repeater {
                        model: [
                            {
                                label: "Languages",
                                icon: "languages"
                            },
                            {
                                label: "Voice",
                                icon: "mic"
                            },
                            {
                                label: "Chat",
                                icon: "message-square"
                            },
                            {
                                label: "Rules",
                                icon: "tune"
                            },
                            {
                                label: "Account",
                                icon: "user-round"
                            }
                        ]
                        SK.ToolButton {
                            required property var modelData
                            required property int index
                            objectName: "settingsNavigation" + index
                            Layout.fillWidth: true
                            Layout.preferredHeight: 38
                            text: modelData.label
                            font.pixelSize: 13
                            icon.source: root.iconRoot + modelData.icon + ".svg"
                            icon.width: 17
                            icon.height: 17
                            icon.color: Tokens.ink
                            checkable: true
                            autoExclusive: true
                            checked: root.currentPage === index
                            onClicked: root.currentPage = index
                            Accessible.name: modelData.label + " app settings"
                        }
                    }
                    Item {
                        Layout.fillHeight: true
                    }
                }
                Rectangle {
                    objectName: "settingsSidebarDivider"
                    anchors.right: parent.right
                    width: 1
                    height: parent.height
                    color: Tokens.line
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.margins: 22
                spacing: 14
                Text {
                    visible: !!root.session.desktop.notice && root.session.desktop.noticeKind === "error"
                    text: root.session.desktop.notice
                    textFormat: Text.PlainText
                    color: Tokens.warning
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                PanelScrollView {
                    id: scroll
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    ColumnLayout {
                        width: scroll.availableWidth
                        spacing: 20
                        LanguagesPage {
                            settings: root
                            visible: root.currentPage === 0
                            Layout.fillWidth: true
                        }
                        VoicePage {
                            settings: root
                            visible: root.currentPage === 1
                            Layout.fillWidth: true
                        }
                        ChatPage {
                            settings: root
                            visible: root.currentPage === 2
                            Layout.fillWidth: true
                        }
                        StylePage {
                            id: stylePage
                            settings: root
                            viewportHeight: scroll.availableHeight
                            visible: root.currentPage === 3
                            Layout.fillWidth: true
                        }
                        AccountPage {
                            settings: root
                            visible: root.currentPage === 4
                            Layout.fillWidth: true
                        }
                    }
                }
                RowLayout {
                    visible: root.changed || root.saving
                    Layout.fillWidth: true
                    Text {
                        text: root.saving ? "Saving…" : "Unsaved changes"
                        color: Tokens.muted
                        font.pixelSize: 12
                        Layout.fillWidth: true
                    }
                    SK.Button {
                        objectName: "appSettingsSave"
                        text: "Save changes"
                        enabled: !root.saving && !root.session.starting && stylePage.rulesValid
                        onClicked: root.apply()
                    }
                }
            }
        }
    }
}
