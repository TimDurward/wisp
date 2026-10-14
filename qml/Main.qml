import QtQuick
import QtQuick.Layouts
import QtWebEngine
import Qt.labs.StyleKit as SK
import "theme"
import "components"
import "services"

SK.ApplicationWindow {
    id: window
    required property var desktop
    required property var translationChannel
    width: 1280
    height: 850
    minimumWidth: 960
    minimumHeight: 660
    visible: true
    title: "Wisp"
    SK.StyleKit.style: WispStyle {}
    property string lastStructure: ""
    property string lastLayoutView: ""
    property int layoutCapturesRemaining: 0
    function captureLayout() {
        layoutCapturesRemaining = 4;
        layoutCapture.restart();
    }
    // Diagnostic captures open real panels without modifying app/account state.
    function capturePanel(name) {
        if (name === "settings")
            settings.openPage(0);
        else if (name === "reading")
            settings.openReading();
        else if (name === "rules")
            rules.openForCurrent();
        else if (name === "defaults")
            settings.openPage(1);
        else if (name === "languages")
            settings.openPage(0);
        else if (name === "account")
            settings.openPage(3);
    }
    Session {
        id: appSession
        desktop: window.desktop
        whatsappLoading: browser.loading
    }
    Binding {
        target: window.desktop
        property: "focusShortcutEnabled"
        value: !appSession.starting && (appSession.hasChat || appSession.focusChat) &&
               !settings.visible && !rules.visible && !welcome.visible
    }
    Connections {
        target: appSession
        function onFocusRequested(focused) {
            const action = appSession.focusPending ? "preview" : "cancel";
            if (window.desktop.isWhatsApp(browser.url))
                browser.runJavaScript("globalThis.__wispLayout?." + action + "(" + JSON.stringify(
                                          focused) + ")", WebEngineScript.ApplicationWorld);
            if (appSession.focusPending)
                focusTimeout.restart();
            window.captureLayout();
        }
        function onPendingFocusChanged() {
            if (!appSession.focusPending)
                focusTimeout.stop();
        }
        function onStateChanged() {
            const view = appSession.state.view_id || "";
            if (view !== window.lastLayoutView) {
                window.lastLayoutView = view;
                window.captureLayout();
            }
        }
    }
    Timer {
        id: focusTimeout
        interval: 2000
        onTriggered: appSession.rollbackFocus()
    }
    Timer {
        id: layoutCapture
        interval: 500
        onTriggered: browser.runJavaScript("globalThis.__wispReadLayout?.()",
                                           WebEngineScript.ApplicationWorld, report => {
                                               if (report)
                                                   window.desktop.saveLayoutDiagnostic(report);
                                               if (--window.layoutCapturesRemaining > 0)
                                                   layoutCapture.restart();
                                           })
    }
    Timer {
        id: noticeTimeout
        interval: 3500
        onTriggered: window.desktop.clearNotice()
    }
    // Development-only structural report. Never logs message text or identifiers.
    function reportStructure() {
        browser.runJavaScript("globalThis.__wispReadStructure?.()", WebEngineScript.ApplicationWorld,
                              result => {
                                  if (!result || result === window.lastStructure)
                                      return;
                                  window.lastStructure = result;
                                  console.info("Wisp structure: " + result);
                                  console.info("Wisp readiness: " + JSON.stringify({
                                                                                       conversation:
                                                                                           !!desktop.state.conversation,
                                                                                       eligible: !
                                                                                                 !desktop.state.eligible,
                                                                                       models: desktop.state.models.length
                                                                                   }));
                              });
    }

    Connections {
        target: window.desktop
        function onWelcome() {
            welcome.open();
        }
        function onNoticeChanged() {
            if (window.desktop.noticeKind === "success")
                noticeTimeout.restart();
            else
                noticeTimeout.stop();
            if (window.desktop.noticeKind === "error")
                appSession.rollbackFocus();
        }
    }
    header: Header {
        session: appSession
        onSettingsRequested: settings.open()
        onLanguagesRequested: settings.openPage(0)
        onRulesRequested: rules.openForCurrent()
    }
    footer: StatusBar {
        session: appSession
        onSettingsRequested: settings.openPage(3)
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        Rectangle {
            visible: !!window.desktop.notice || !!browser.loadError
            Layout.fillWidth: true
            implicitHeight: noticeRow.implicitHeight + 20
            color: Tokens.accentTint
            RowLayout {
                id: noticeRow
                anchors.fill: parent
                anchors.margins: 10
                spacing: 12
                Text {
                    text: window.desktop.notice || browser.loadError
                    textFormat: Text.PlainText
                    color: window.desktop.noticeKind === "success" ? Tokens.accent : Tokens.warning
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                    font.pixelSize: 12
                }
                SK.ToolButton {
                    text: "Dismiss"
                    onClicked: {
                        window.desktop.clearNotice();
                        browser.loadError = "";
                    }
                }
            }
        }
        WhatsAppView {
            id: browser
            desktop: window.desktop
            translationChannel: window.translationChannel
            Layout.fillWidth: true
            Layout.fillHeight: true
        }
    }
    DraftEditor {
        desktop: window.desktop
        browser: browser
        blocked: settings.visible || rules.visible || welcome.visible
    }

    SettingsDialog {
        id: settings
        session: appSession
        parent: window.contentItem
        onRulesRequested: rules.openForCurrent()
        onReloadRequested: browser.reload()
    }
    RulesDialog {
        id: rules
        session: appSession
        parent: window.contentItem
    }
    SK.Popup {
        id: welcome
        anchors.centerIn: parent
        width: 390
        padding: 26
        modal: true
        ColumnLayout {
            width: parent.width
            spacing: 18
            Text {
                text: "ChatGPT connected"
                color: Tokens.ink
                font.pixelSize: 20
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            Text {
                text: "Your plan’s model access and usage limits apply."
                color: Tokens.muted
                font.pixelSize: 13
                wrapMode: Text.WordWrap
                lineHeight: 1.5
                Layout.fillWidth: true
            }
            SK.Button {
                text: "Got it"
                onClicked: welcome.close()
                Layout.alignment: Qt.AlignRight
            }
        }
    }
    Shortcut {
        sequences: [StandardKey.Preferences]
        onActivated: settings.open()
    }
    Shortcut {
        sequences: [StandardKey.Refresh]
        onActivated: browser.reload()
    }
    Connections {
        target: window.desktop
        function onFocusShortcutRequested() {
            appSession.setPreference("focus_chat", !appSession.focusChat);
        }
    }
}
