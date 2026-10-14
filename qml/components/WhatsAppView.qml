import QtQuick
import QtWebEngine
import QtWebChannel
import "../theme"

WebEngineView {
    id: root
    required property var desktop
    required property var translationChannel
    property string loadError: ""
    property url initialUrl: "https://web.whatsapp.com/"
    objectName: "whatsappView"
    backgroundColor: Tokens.canvas
    webChannel: WebChannel {
        registeredObjects: [pageProxy]
    }
    webChannelWorld: WebEngineScript.ApplicationWorld
    settings.localContentCanAccessRemoteUrls: false
    settings.localContentCanAccessFileUrls: false
    settings.fullScreenSupportEnabled: false
    WebEngineProfilePrototype {
        id: profileConfiguration
        storageName: "WispWhatsApp"
        persistentStoragePath: root.desktop.dataRoot + "/whatsapp/storage"
        cachePath: root.desktop.dataRoot + "/whatsapp/cache"
        persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
        persistentPermissionsPolicy: WebEngineProfile.StoreInMemory
    }
    // Only this narrow proxy enters the isolated webpage world.
    QtObject {
        id: pageProxy
        WebChannel.id: "translation"
        signal translationEvent(string payload)
        function submit(payload) {
            root.translationChannel.submit(payload);
        }
    }
    Connections {
        target: root.translationChannel
        function onTranslationEvent(payload) {
            pageProxy.translationEvent(payload);
        }
    }

    Component.onCompleted: {
        const persistentProfile = profileConfiguration.instance();
        if (!persistentProfile) {
            root.loadError = "The WhatsApp profile is already in use. Close the other Wisp window and try again.";
            return;
        }
        // Keep Qt's real Chromium/platform versions; remove only the embedding token
        // that WhatsApp's browser detection treats as an unsupported browser.
        persistentProfile.httpUserAgent = persistentProfile.httpUserAgent.replace(/\sQtWebEngine\/\S+/g, "");
        profile = persistentProfile;
        const script = WebEngine.script();
        script.name = "wisp-translation";
        script.sourceCode = root.desktop.injectedScript;
        script.injectionPoint = WebEngineScript.DocumentReady;
        script.worldId = WebEngineScript.ApplicationWorld;
        script.runsOnSubFrames = false;
        userScripts.insert(script);
        const voice = WebEngine.script();
        voice.name = "wisp-voice-source";
        voice.sourceCode = root.desktop.voiceSourceScript;
        voice.injectionPoint = WebEngineScript.DocumentReady;
        voice.worldId = WebEngineScript.MainWorld;
        voice.runsOnSubFrames = false;
        userScripts.insert(voice);
        url = root.initialUrl;
    }
    onNavigationRequested: request => {
        if (!request.isMainFrame || root.desktop.isWhatsApp(request.url) || (root.initialUrl.toString() === "about:blank" && request.url.toString() === "about:blank"))
            return;
        request.reject();
        if (request.navigationType === WebEngineNavigationRequest.LinkClickedNavigation)
            root.desktop.openExternal(request.url);
    }
    onNewWindowRequested: request => {
        if (request.userInitiated)
            root.desktop.openExternal(request.requestedUrl);
    }
    onPermissionRequested: permission => permission.deny()
    // Website console output can contain private conversation data.
    onJavaScriptConsoleMessage: (level, message, lineNumber, sourceID) => {}
    onCertificateError: error => error.rejectCertificate()
    onLoadingChanged: info => {
        if (info.status === WebEngineView.LoadFailedStatus)
            root.loadError = "WhatsApp could not connect. Check your connection and reload.";
        if (info.status === WebEngineView.LoadSucceededStatus)
            root.loadError = "";
    }
    onRenderProcessTerminated: (terminationStatus, exitCode) => {
        root.loadError = "WhatsApp stopped unexpectedly. Reload to reconnect.";
    }
}
