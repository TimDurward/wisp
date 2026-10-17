#include "wisp/DesktopController.h"
#include "wisp/Editor.h"
#include "wisp/WebOrigin.h"
#include "wisp/src/desktop/bridge.cxxqt.h"
#include <QClipboard>
#include <QDateTime>
#include <QDesktopServices>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
namespace wisp {
static QString resource(const QString& name) {
    QFile file(name);
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QString::fromUtf8(file.readAll());
}
DesktopController::DesktopController(WispBridge* backend, QString root, bool diagnostics,
                                     QObject* parent)
    : QObject(parent), backend_(backend), root_(std::move(root)), diagnostics_(diagnostics) {
    state_ = {{QStringLiteral("initialized"), false},
              {QStringLiteral("models_busy"), false},
              {QStringLiteral("translation_ready"), false},
              {QStringLiteral("rules"), QString()},
              {QStringLiteral("conversation"), QString()},
              {QStringLiteral("chat_detection"), QStringLiteral("no_chat")},
              {QStringLiteral("enabled"), false},
              {QStringLiteral("eligible"), false},
              {QStringLiteral("signed_in"), false},
              {QStringLiteral("models"), QVariantList()},
              {QStringLiteral("accounts"), QVariantList()}};
    QObject::connect(backend, &WispBridge::nativeEvent, this, [this](const QString& payload) {
        const auto event = QJsonDocument::fromJson(payload.toUtf8()).object();
        const auto type = event[QStringLiteral("type")].toString();
        if (type == QStringLiteral("appearance")) {
            Q_EMIT appearanceChanged(event[QStringLiteral("dark")].toBool());
        } else if (type == QStringLiteral("status")) {
            const auto next = event.toVariantMap();
            if (next != state_) {
                state_ = next;
                Q_EMIT stateChanged();
            }
        } else if (type == QStringLiteral("speech_model")) {
            state_.insert(QStringLiteral("speech"), event[QStringLiteral("speech")].toVariant());
            Q_EMIT stateChanged();
        } else if (type == QStringLiteral("auth_busy")) {
            noticeKind_ = QStringLiteral("info");
            authBusy_ = event[QStringLiteral("busy")].toBool();
            authUrl_.clear();
            Q_EMIT authBusyChanged();
            Q_EMIT authLinkChanged();
            notice_ = authBusy_ ? QStringLiteral("Finish connecting in your browser.") : QString();
            Q_EMIT noticeChanged();
        } else if (type == QStringLiteral("open_auth")) {
            // Identity hints stay native, never entering QML state or the webpage.
            const QUrl url(event[QStringLiteral("url")].toString());
            if (authBusy_ && chatGptAuthUrl(url)) {
                authUrl_ = copyableChatGptAuthUrl(url) ? url : QUrl();
                Q_EMIT authLinkChanged();
                QDesktopServices::openUrl(url);
            }
        } else if (type == QStringLiteral("welcome")) {
            Q_EMIT welcome();
        } else if (type == QStringLiteral("notice")) {
            noticeKind_ = event[QStringLiteral("kind")].toString();
            notice_ = event[QStringLiteral("message")].toString();
            Q_EMIT noticeChanged();
            if (event.contains(QStringLiteral("view_id"))) {
                Q_EMIT rulesSaved(event[QStringLiteral("view_id")].toString());
            }
            if (event[QStringLiteral("translation_preferences_saved")].toBool()) {
                Q_EMIT translationPreferencesSaved();
            }
        } else if (type == QStringLiteral("draft_edit")) {
            draftEdit_ = event;
            editDeadline_ = QDateTime::currentMSecsSinceEpoch() + 3000;
            Q_EMIT draftEditRequested(payload);
        } else if (type == QStringLiteral("error")) {
            noticeKind_ = QStringLiteral("error");
            notice_ = event[QStringLiteral("message")].toString();
            Q_EMIT noticeChanged();
        }
    });
}
QString DesktopController::injectedScript() const {
    // The compiled bundle and Qt channel run only in WebEngine's ApplicationWorld.
    return QStringLiteral("globalThis.__wispDiagnostics = ") +
           (diagnostics_ ? QStringLiteral("true;\n") : QStringLiteral("false;\n")) +
           resource(QStringLiteral(":/qtwebchannel/qwebchannel.js")) +
           resource(QStringLiteral(":/wisp/web/wisp.js"));
}
QString DesktopController::voiceSourceScript() const {
    return resource(QStringLiteral(":/wisp/web/voice-source.js"));
}
void DesktopController::command(const QString& payload) {
    if (payload.size() <= 32000) {
        backend_->nativeCommand(payload);
    }
}
bool DesktopController::commitDraft(const QString& editId) {
    if (draftEdit_[QStringLiteral("edit_id")].toString() != editId) {
        return false;
    }
    const auto edit = draftEdit_;
    draftEdit_ = {};
    if (QDateTime::currentMSecsSinceEpoch() > editDeadline_ || !view_ ||
        !whatsAppOrigin(view_->property("url").toUrl()) ||
        !state_.value(QStringLiteral("enabled")).toBool() ||
        state_.value(QStringLiteral("view_id")).toString() !=
            edit[QStringLiteral("view_id")].toString() ||
        state_.value(QStringLiteral("revision")).toULongLong() !=
            edit[QStringLiteral("revision")].toVariant().toULongLong()) {
        return false;
    }
    return commitEditorText(qobject_cast<QQuickItem*>(view_.data()),
                            edit[QStringLiteral("text")].toString());
}
void DesktopController::openUsage() {
    QDesktopServices::openUrl(QUrl(QStringLiteral("https://chatgpt.com/settings/usage")));
}
void DesktopController::copyAuthLink() {
    if (!canCopyAuthLink()) {
        return;
    }
    QGuiApplication::clipboard()->setText(authUrl_.toString(QUrl::FullyEncoded));
    noticeKind_ = QStringLiteral("info");
    notice_ = QStringLiteral("Sign-in link copied. Paste it into a private browser window to "
                             "choose your ChatGPT account.");
    Q_EMIT noticeChanged();
}
void DesktopController::openExternal(const QUrl& url) {
    if (externalWebUrl(url)) {
        QDesktopServices::openUrl(url);
    }
}
bool DesktopController::isWhatsApp(const QUrl& url) const { return whatsAppOrigin(url); }
void DesktopController::clearNotice() {
    notice_.clear();
    Q_EMIT noticeChanged();
}
void DesktopController::saveLayoutDiagnostic(const QString& payload) {
    if (!diagnostics_ || payload.size() > 128000) {
        return;
    }
    const auto data = QJsonDocument::fromJson(payload.toUtf8());
    if (!data.isObject() || !data.object()[QStringLiteral("main")].toBool() ||
        data.object()[QStringLiteral("nodes")].toArray().isEmpty()) {
        return;
    }
    // Keep both useful states; a navigation/loading snapshot must not erase
    // the collapsed report needed to diagnose the actual rendering issue.
    const auto name = data.object()[QStringLiteral("focused")].toBool()
                          ? QStringLiteral("/focus-layout-collapsed.json")
                          : QStringLiteral("/focus-layout-expanded.json");
    QSaveFile file(root_ + name);
    if (!file.open(QIODevice::WriteOnly)) {
        return;
    }
    file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    if (file.write(data.toJson(QJsonDocument::Compact)) < 0) {
        return;
    }
    file.commit();
}
} // namespace wisp
