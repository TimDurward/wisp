import QtQuick
import QtWebEngine

Item {
    id: root
    visible: false
    required property var desktop
    required property var browser
    property bool blocked: false
    property var draftSelection: null
    property bool selectionBusy: false
    function finishDraftSelection(editId, selected) {
        if (!draftSelection || draftSelection.edit_id !== editId)
            return;
        draftSelection = null;
        selectionTimer.stop();
        const committed = selected && root.desktop.commitDraft(editId);
        root.browser.runJavaScript("globalThis.__wispDraftEditing?.settle(" + JSON.stringify(
                                       editId) + "," + committed + ")",
                                   WebEngineScript.ApplicationWorld);
    }
    Timer {
        id: selectionTimer
        interval: 35
        repeat: true
        onTriggered: {
            if (!root.draftSelection || root.selectionBusy)
                return;
            const editId = root.draftSelection.edit_id;
            if (root.blocked) {
                root.finishDraftSelection(editId, false);
                return;
            }
            root.selectionBusy = true;
            root.browser.runJavaScript("globalThis.__wispDraftEditing?.selected(" + JSON.stringify(
                                           editId) + ")", WebEngineScript.ApplicationWorld,
                                       selected => {
                                           root.selectionBusy = false;
                                           if (!root.draftSelection || root.draftSelection.edit_id
                                                   !== editId)
                                               return;
                                           if (selected === true)
                                               root.finishDraftSelection(editId, true);
                                           else if (selected !== false || Date.now()
                                                    > root.draftSelection.deadline)
                                               root.finishDraftSelection(editId, false);
                                       });
        }
    }
    Connections {
        target: root.desktop
        function onDraftEditRequested(payload) {
            const edit = JSON.parse(payload);
            const argument = JSON.stringify(edit);
            if (root.blocked) {
                root.browser.runJavaScript("globalThis.__wispDraftEditing?.settle(" + JSON.stringify(
                                               edit.edit_id) + ",false)",
                                           WebEngineScript.ApplicationWorld);
                return;
            }
            root.browser.forceActiveFocus();
            root.browser.runJavaScript("globalThis.__wispDraftEditing?.begin(" + argument + ")",
                                       WebEngineScript.ApplicationWorld, focused => {
                                           if (!focused)
                                               return;
                                           root.browser.triggerWebAction(WebEngineView.SelectAll);
                                           // Chromium may process SelectAll after the next JS callback.
                                           root.draftSelection = {
                                               edit_id: edit.edit_id,
                                               deadline: Date.now() + 1500
                                           };
                                           selectionTimer.restart();
                                       });
        }
    }
}
