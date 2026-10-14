// Offline test of the two WebEngine script worlds; no account or network.
import QtQuick
import QtWebEngine

Window {
    id: window
    required property var editingCheck
    visible: true
    width: 480
    height: 400
    property int attempts: 0
    WebEngineProfilePrototype {
        id: testProfile
    }
    WebEngineView {
        id: browser
        anchors.fill: parent
        Component.onCompleted: {
            profile = testProfile.instance();
            loadHtml('<main id="main"><div data-id="false_123@lid_VOICE"><div class="message-in"><button aria-label="Play voice message"><span data-icon="audio-play">Play</span></button></div></div></main>', 'https://web.whatsapp.com/');
        }
        onLoadingChanged: info => {
            if (info.status !== WebEngineView.LoadSucceededStatus)
                return;
            const setup = "globalThis.mainOnlySecret = 'isolated'; HTMLMediaElement.prototype.play = function() { return Promise.resolve(); }; const fixtureAudioUrl = URL.createObjectURL(new Blob(['audio'], {type:'audio/ogg'})); document.querySelector('button').addEventListener('click', () => new Audio(fixtureAudioUrl).play());";
            runJavaScript(setup + window.editingCheck.voiceScript(true), WebEngineScript.MainWorld, () => {
                const exercise = "; globalThis.voiceResult = ''; const note = testAdapter.voiceNotes(document.querySelector('#main'))[0]; testAdapter.voiceSource(note, new AbortController().signal).then(url => { voiceResult = url.startsWith('blob:https://web.whatsapp.com/') && typeof mainOnlySecret === 'undefined' ? 'passed' : 'wrong source or leaked global'; }, error => { voiceResult = String(error); });";
                browser.runJavaScript(window.editingCheck.voiceScript(false) + exercise, WebEngineScript.ApplicationWorld, () => verify.start());
            });
        }
    }
    Timer {
        id: verify
        interval: 50
        repeat: true
        onTriggered: browser.runJavaScript("globalThis.voiceResult || ''", WebEngineScript.ApplicationWorld, result => {
            if (!result && ++window.attempts < 100)
                return;
            verify.stop();
            window.editingCheck.result(result === 'passed', 'Media source across WebEngine worlds: ' + result);
        })
    }
}
