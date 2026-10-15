#ifndef WISP_DESKTOPCONTROLLER_H
#define WISP_DESKTOPCONTROLLER_H
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QUrl>
#include <QVariantMap>
namespace wisp {
class WispBridge;
// Trusted QML controller; it is not registered with WebChannel.
class DesktopController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantMap state READ state NOTIFY stateChanged)
    Q_PROPERTY(bool authBusy READ authBusy NOTIFY authBusyChanged)
    Q_PROPERTY(QString notice READ notice NOTIFY noticeChanged)
    Q_PROPERTY(QString noticeKind READ noticeKind NOTIFY noticeChanged)
    Q_PROPERTY(QString dataRoot READ dataRoot CONSTANT)
    Q_PROPERTY(QString injectedScript READ injectedScript CONSTANT)
    Q_PROPERTY(QString voiceSourceScript READ voiceSourceScript CONSTANT)
    Q_PROPERTY(bool diagnostics READ diagnostics CONSTANT)
    Q_PROPERTY(bool focusShortcutEnabled MEMBER focusShortcutEnabled_)
public:
    DesktopController(WispBridge* backend, QString root, bool diagnostics,
                      QObject* parent = nullptr);
    QVariantMap state() const { return state_; }
    bool authBusy() const { return authBusy_; }
    QString notice() const { return notice_; }
    QString noticeKind() const { return noticeKind_; }
    QString dataRoot() const { return root_; }
    QString injectedScript() const;
    QString voiceSourceScript() const;
    bool diagnostics() const { return diagnostics_; }
    void setView(QObject* view) { view_ = view; }
    Q_INVOKABLE bool commitDraft(const QString& editId);
    Q_INVOKABLE void command(const QString& payload);
    Q_INVOKABLE void openUsage();
    Q_INVOKABLE void openExternal(const QUrl& url);
    Q_INVOKABLE bool isWhatsApp(const QUrl& url) const;
    Q_INVOKABLE void clearNotice();
    Q_INVOKABLE void saveLayoutDiagnostic(const QString& payload);
Q_SIGNALS:
    void stateChanged();
    void appearanceChanged(bool dark);
    void authBusyChanged();
    void noticeChanged();
    void welcome();
    void rulesSaved(const QString& viewId);
    void translationPreferencesSaved();
    void draftEditRequested(const QString& payload);
    void focusShortcutRequested();

private:
    WispBridge* backend_;
    QString root_;
    QString notice_;
    QString noticeKind_ = QStringLiteral("info");
    QVariantMap state_;
    bool authBusy_ = false;
    bool diagnostics_ = false;
    bool focusShortcutEnabled_ = false;
    QPointer<QObject> view_;
    QJsonObject draftEdit_;
    qint64 editDeadline_ = 0;
};
} // namespace wisp

#endif
