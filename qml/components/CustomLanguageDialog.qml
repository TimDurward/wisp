import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

SK.Popup {
    id: root
    objectName: "customLanguageDialog"
    required property var session
    required property var languages
    signal languageSaved(string languageId)
    anchors.centerIn: parent
    width: Math.min(440, parent.width - 40)
    height: Math.min(340, parent.height - 32)
    padding: 24
    modal: true
    dim: true
    T.Overlay.modal: Rectangle {
        color: "#66000000"
    }
    property bool saving: false
    property string error: ""
    property string pendingName: ""
    property string pendingRegion: ""
    function findLanguage(name, region) {
        return languages.find(item => {
            const value = item.value;
            if (typeof value === "object" && value) {
                const sameName = value.name.toLowerCase() === name.toLowerCase();
                const sameRegion = (value.region || "").toLowerCase() === region.toLowerCase();
                return sameName && sameRegion;
            }
            return !region && item.label.toLowerCase() === name.toLowerCase();
        });
    }
    function finish(language) {
        saving = false;
        languageSaved(language.id);
        close();
    }
    function add() {
        pendingName = nameField.text.trim();
        pendingRegion = regionField.text.trim();
        const existing = findLanguage(pendingName, pendingRegion);
        if (existing) {
            finish(existing);
            return;
        }
        error = "";
        saving = true;
        session.command("add_language", {
                            name: pendingName,
                            region: pendingRegion
                        });
    }
    onAboutToShow: {
        nameField.text = "";
        regionField.text = "";
        saving = false;
        error = "";
    }
    onOpened: nameField.forceActiveFocus()
    onLanguagesChanged: {
        if (saving) {
            const added = findLanguage(pendingName, pendingRegion);
            if (added)
                finish(added);
        }
    }
    Connections {
        target: root.session.desktop
        function onNoticeChanged() {
            if (root.saving && root.session.desktop.noticeKind === "error") {
                root.error = root.session.desktop.notice;
                root.saving = false;
            }
        }
    }
    contentItem: ColumnLayout {
        spacing: 16
        Text {
            text: "Add language or region"
            color: Tokens.ink
            font.pixelSize: 23
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
        PanelScrollView {
            id: form
            Layout.fillWidth: true
            Layout.fillHeight: true
            ColumnLayout {
                width: form.availableWidth
                spacing: 10
                Text {
                    text: "Available for both reading and replies."
                    color: Tokens.muted
                    font.pixelSize: 13
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                Text {
                    text: "Language"
                    color: Tokens.ink
                    font.pixelSize: 13
                }
                SK.TextField {
                    id: nameField
                    objectName: "customLanguageName"
                    Layout.fillWidth: true
                    placeholderText: "For example, Tamil"
                    maximumLength: 80
                    enabled: !root.saving
                    Accessible.name: "Language name"
                    onAccepted: regionField.forceActiveFocus()
                }
                Text {
                    text: "Region or dialect · Optional"
                    color: Tokens.ink
                    font.pixelSize: 13
                }
                SK.TextField {
                    id: regionField
                    objectName: "customLanguageRegion"
                    Layout.fillWidth: true
                    placeholderText: "For example, Sri Lanka"
                    maximumLength: 80
                    enabled: !root.saving
                    Accessible.name: "Region or dialect"
                    onAccepted: {
                        if (save.enabled)
                            root.add();
                    }
                }
                Text {
                    visible: !!root.error
                    text: root.error
                    textFormat: Text.PlainText
                    color: Tokens.warning
                    font.pixelSize: 12
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Item {
                Layout.fillWidth: true
            }
            SK.ToolButton {
                text: "Cancel"
                enabled: !root.saving
                onClicked: root.close()
            }
            SK.Button {
                id: save
                objectName: "customLanguageSave"
                text: root.saving ? "Adding…" : "Add language"
                enabled: !!nameField.text.trim() && !root.saving && !root.session.starting
                onClicked: root.add()
            }
        }
    }
}
