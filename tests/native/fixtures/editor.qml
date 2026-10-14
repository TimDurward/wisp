// Controlled editor fixture, without WhatsApp, accounts, or network requests.
import QtQuick
import QtWebEngine

Window {
    id: window
    required property var editingCheck
    visible: true
    width: 700
    height: 500
    property int selectionAttempts: 0
    property bool attachmentStage: false
    property int readyAttempts: 0
    WebEngineProfilePrototype {
        id: testProfile
    }
    WebEngineView {
        id: browser
        objectName: "editorBrowser"
        anchors.fill: parent
        Component.onCompleted: {
            profile = testProfile.instance();
            if (!profile.offTheRecord) {
                window.editingCheck.result(false, "Expected an in-memory profile");
                return;
            }
            url = "data:text/html," + encodeURIComponent(
                        '<style>body{margin:0;background:#111b21;color:#eee;font:14px sans-serif}#shell{display:grid;grid-template-columns:160px 2px 1fr;height:100vh}#chat{position:relative;grid-column:3;border-left:1px solid red}#chat::before{content:"";position:absolute;left:0;top:0;width:1px;height:100%;background:red}#chat-inner{border-left:1px solid red}#divider{background:red}#main{height:100vh;display:flex;flex-direction:column;justify-content:flex-end;padding:12px;box-sizing:border-box}#messages{flex:1;margin-inline:28px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;border-inline:1px solid red}#messages::after{content:"";position:absolute;inset:0;border-inline:1px solid red;pointer-events:none}#pill{display:flex;align-items:center;gap:12px;padding:12px;background:#202c33;border-radius:20px}#editor{flex:1}#pill button{border:0;border-radius:50%;background:#00a884;color:white;width:36px;height:36px}.message-out{border:1px solid green;position:relative;display:inline-block;max-width:430px;padding:10px;border-radius:8px;background:#005c4b;margin-bottom:12px}#time{position:absolute;bottom:6px;right:10px;font-size:11px;line-height:14px}</style><div id="shell"><aside><div id="pane-side">Chat list</div></aside><div id="divider" role="separator" aria-orientation="vertical"></div><div id="chat"><div id="chat-inner"><main id="main"><section id="messages"><div data-id="true_123@lid_TEST"><div class="message-out"><span class="selectable-text">Original</span><span id="time">4:49 PM ✓✓</span></div></div></section><div id="pill"><div id="editor" contenteditable="true" role="textbox">Hello</div><button aria-label="Send">➤</button></div></main></div></div></div>');
        }
        onJavaScriptConsoleMessage: (level, message, line, source) => console.info("Fixture JS: "
                                                                                   + message)
        onLoadingChanged: info => {
            if (info.status !== WebEngineView.LoadSucceededStatus)
                return;
            browser.runJavaScript("(() => { try { " + window.editingCheck.script()
                                  + "; return 'ready'; } catch (error) { return String(error); } })()",
                                  WebEngineScript.ApplicationWorld, result => {
                                      if (result !== "ready") {
                                          window.editingCheck.result(false, "Fixture setup: "
                                                                     + result);
                                          return;
                                      }
                                      ready.start();
                                  });
        }
    }
    Timer {
        id: ready
        interval: 50
        repeat: true
        onTriggered: browser.runJavaScript("!!globalThis.editorCheck",
                                           WebEngineScript.ApplicationWorld, loaded => {
                                               if (!loaded) {
                                                   if (++window.readyAttempts > 30)
                                                       browser.runJavaScript(
                                                                   "JSON.stringify({adapter:!!window.testAdapter,chat:!!document.querySelector('#chat'),href:location.protocol})",
                                                                   WebEngineScript.ApplicationWorld,
                                                                   report => window.editingCheck.result(
                                                                                 false, "Isolated script readiness: "
                                                                                 + report));
                                                   return;
                                               }
                                               ready.stop();
                                               browser.forceActiveFocus();
                                               browser.runJavaScript("editorCheck.focus()",
                                                                     WebEngineScript.ApplicationWorld,
                                                                     focused => {
                                                                         if (!focused) {
                                                                             window.editingCheck.result(
                                                                                         false, "DOM editor focus");
                                                                             return;
                                                                         }
                                                                         if (!window.editingCheck.shortcut(
                                                                                     )) {
                                                                             window.editingCheck.result(
                                                                                         false, "Native Command+B interception");
                                                                             return;
                                                                         }
                                                                         browser.triggerWebAction(
                                                                                     WebEngineView.SelectAll);
                                                                         selection.start();
                                                                     });
                                           })
    }
    Timer {
        id: selection
        interval: 35
        repeat: true
        onTriggered: browser.runJavaScript("editorCheck.selected()",
                                           WebEngineScript.ApplicationWorld, selected => {
                                               if (!selected) {
                                                   if (++window.selectionAttempts > 40)
                                                       window.editingCheck.result(false,
                                                                                  "Native SelectAll / isolated selection");
                                                   return;
                                               }
                                               selection.stop();
                                               if (!window.editingCheck.commit(
                                                           window.attachmentStage ? "Mira esto 😊" :
                                                                                    "Hola\n¿Cómo estás? 😊")) {
                                                   window.editingCheck.result(false,
                                                                              "Native input focus scope");
                                                   return;
                                               }
                                               verify.start();
                                           })
    }
    Timer {
        id: verify
        interval: 100
        onTriggered: browser.runJavaScript(window.attachmentStage
                                           ? "JSON.stringify({text:editorCheck.text(),layout:editorCheck.layout(),background:editorCheck.background()})" :
                                             "JSON.stringify({text:editorCheck.text(),layout:editorCheck.layout(),keys:editorCheck.keys(),reading:editorCheck.readingLayout(),focused:editorCheck.focusLayout(),diagnostic:editorCheck.diagnostic()})",
                                           WebEngineScript.ApplicationWorld, result => {
                                               const check = JSON.parse(result);
                                               if (window.attachmentStage) {
                                                   window.editingCheck.result(check.text
                                                                              === "Mira esto 😊"
                                                                              && check.layout
                                                                              && check.background
                                                                              === "Hola\n¿Cómo estás? 😊",
                                                                              "Native chat and attachment input, selection, preview layout, timestamp, popup and focus edges "
                                                                              + JSON.stringify(
                                                                                  check));
                                                   return;
                                               }
                                               if (!(check.keys === 0 && check.text
                                                     === "Hola\n¿Cómo estás? 😊" && check.layout
                                                     && check.reading && check.focused.passed
                                                     && check.diagnostic)) {
                                                   window.editingCheck.result(false, JSON.stringify(
                                                                                  check));
                                                   return;
                                               }
                                               console.log("Native chat layout passed: "
                                                           + JSON.stringify(check));
                                               window.attachmentStage = true;
                                               window.selectionAttempts = 0;
                                               browser.runJavaScript("editorCheck.attachment()",
                                                                     WebEngineScript.ApplicationWorld,
                                                                     focused => {
                                                                         if (!focused) {
                                                                             window.editingCheck.result(
                                                                                         false, "Attachment editor focus");
                                                                             return;
                                                                         }
                                                                         browser.triggerWebAction(
                                                                                     WebEngineView.SelectAll);
                                                                         selection.start();
                                                                     });
                                           })
    }
}
