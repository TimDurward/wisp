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
    signal rulesRequested
    signal reloadRequested
    anchors.centerIn: parent
    width: Math.min(800, parent.width - 40)
    height: Math.min(660, parent.height - 32)
    padding: 22
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
    readonly property var languages: session.state.languages || []
    readonly property var variants: session.state.spanish_variants || []
    readonly property bool changed: readingLanguage !== original.reading_language || replyLanguage
                                    !== original.reply_language || spanishVariant
                                    !== original.spanish_variant || stylePage.rulesText.replace(
                                        /\r\n/g, "\n").trim() !== original.global_rules.trim()
    function loadDraft() {
        original = Object.assign({}, session.translationPreferences);
        readingLanguage = original.reading_language;
        replyLanguage = original.reply_language;
        spanishVariant = original.spanish_variant;
        stylePage.rulesText = original.global_rules;
    }
    function openPage(index) {
        tabs.currentIndex = index;
        open();
    }
    function openReading() {
        openPage(2);
    }
    function apply() {
        saving = true;
        session.command("translation_preferences", {
                            preferences: {
                                reading_language: readingLanguage,
                                reply_language: replyLanguage,
                                spanish_variant: spanishVariant,
                                global_rules: stylePage.rulesText
                            }
                        });
    }
    onAboutToShow: {
        if (!changed && !saving)
            loadDraft();
    }
    Connections {
        target: root.session
        function onStateChanged() {
            const incoming = root.session.translationPreferences;
            if (!root.changed && !root.saving && (incoming.reading_language
                                                  !== root.original.reading_language
                                                  || incoming.reply_language
                                                  !== root.original.reply_language
                                                  || incoming.spanish_variant
                                                  !== root.original.spanish_variant
                                                  || incoming.global_rules
                                                  !== root.original.global_rules))
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
    contentItem: ColumnLayout {
        spacing: 16
        RowLayout {
            Layout.fillWidth: true
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text {
                    text: "Settings"
                    color: Tokens.ink
                    font.pixelSize: 25
                    font.weight: Font.DemiBold
                }
                Item {
                    Layout.fillWidth: true
                }
            }
            SK.ToolButton {
                text: "Done"
                onClicked: root.close()
            }
        }
        SK.TabBar {
            id: tabs
            Layout.fillWidth: true
            SK.TabButton {
                text: "Languages"
            }
            SK.TabButton {
                text: "Style rules"
            }
            SK.TabButton {
                text: "Chat experience"
            }
            SK.TabButton {
                text: "Account"
            }
            onCurrentIndexChanged: {
                if (scroll) {
                    const flickable = scroll.contentItem as Flickable;
                    if (flickable)
                        flickable.contentY = 0;
                }
            }
        }
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
                spacing: 16
                LanguagesPage {
                    id: languagesPage
                    settings: root
                    visible: tabs.currentIndex === 0
                    Layout.fillWidth: true
                }
                StylePage {
                    id: stylePage
                    settings: root
                    viewportHeight: scroll.availableHeight
                    visible: tabs.currentIndex === 1
                    Layout.fillWidth: true
                }
                ChatPage {
                    id: chatPage
                    settings: root
                    visible: tabs.currentIndex === 2
                    Layout.fillWidth: true
                }
                AccountPage {
                    id: accountPage
                    settings: root
                    visible: tabs.currentIndex === 3
                    Layout.fillWidth: true
                }
            }
        }
        Rectangle {
            color: Tokens.line
            Layout.fillWidth: true
            implicitHeight: 1
        }
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: root.saving ? "Saving…" : root.changed ? "Unsaved changes" :
                                                               "Preferences save automatically"
                color: root.changed ? Tokens.warning : Tokens.muted
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            SK.Button {
                text: "Apply changes"
                visible: root.changed || root.saving
                enabled: !root.saving && !root.session.starting && stylePage.rulesValid
                onClicked: root.apply()
            }
        }
    }
}
