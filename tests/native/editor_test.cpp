// Isolated Qt editing regression harness. Never packaged with Wisp.
#include "wisp/Editor.h"
#include "wisp/FocusShortcutFilter.h"
#include "wisp/WebOrigin.h"
#include <QAccessible>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QInputMethodEvent>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlApplicationEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>

class EditingCheck final : public QObject {
    Q_OBJECT
public:
    QString root;
    QQuickItem* view = nullptr;
    int shortcutCount = 0;
    bool shortcutEnabled = true;
    Q_INVOKABLE bool shortcut() {
        QTest::keyClick(view->window(), Qt::Key_B, Qt::ControlModifier);
        return shortcutCount == 1;
    }
    Q_INVOKABLE QString script() {
        QFile file(root + "/web/dist/qt-fixture.js");
        if (!file.open(QIODevice::ReadOnly)) {
            return {};
        }
        return QString::fromUtf8(file.readAll());
    }
    Q_INVOKABLE bool commit(const QString& text) { return wisp::commitEditorText(view, text); }
    Q_INVOKABLE QString voiceScript(bool source) {
        QFile file(root + (source ? "/web/dist/voice-source.js" : "/web/dist/testing.js"));
        if (!file.open(QIODevice::ReadOnly)) {
            return {};
        }
        return QString::fromUtf8(file.readAll());
    }
    bool passed = false;
    QString detail;
    Q_INVOKABLE void result(bool success, const QString& message) {
        passed = success;
        detail = message;
        Q_EMIT finished();
    }
Q_SIGNALS:
    void finished();
};
class EditorTest final : public QObject {
    Q_OBJECT
private Q_SLOTS:
    void linksOnlyOpenWebUrls() {
        QVERIFY(wisp::externalWebUrl(QUrl("https://example.com/path?q=1#here")));
        QVERIFY(wisp::externalWebUrl(QUrl("http://example.com/path")));
        for (const auto* url : {"javascript:alert(1)", "file:///tmp/file",
                                "https://user:pass@example.com", "https:"}) {
            QVERIFY(!wisp::externalWebUrl(QUrl(url)));
        }
    }
    void nativeInputAndPresentation() {
        EditingCheck check;
        check.root = QStringLiteral(WISP_SOURCE_DIR);
        QSignalSpy finished(&check, &EditingCheck::finished);
        QQmlApplicationEngine engine;
        engine.setInitialProperties({{"editingCheck", QVariant::fromValue(&check)}});
        engine.load(QUrl::fromLocalFile(check.root + "/tests/native/fixtures/editor.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        check.view =
            engine.rootObjects().first()->findChild<QQuickItem*>(QStringLiteral("editorBrowser"));
        QVERIFY(check.view);
        auto* filter = new wisp::FocusShortcutFilter(
            check.view->window(), [&] { return check.shortcutEnabled; },
            [&] { ++check.shortcutCount; });
        qApp->installEventFilter(filter);
        QTRY_VERIFY_WITH_TIMEOUT(!finished.isEmpty(), 15000);
        QVERIFY2(check.passed, qPrintable(check.detail));
    }
    void quietCompanionProductionShellLoadsOffline() {
        QTemporaryDir profile;
        QVERIFY(profile.isValid());
        QQmlApplicationEngine engine;
        engine.setInitialProperties({{"fixtureRoot", profile.path()}});
        engine.load(QUrl::fromLocalFile(
            QStringLiteral(WISP_SOURCE_DIR "/tests/native/fixtures/shell.qml")));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto* shell = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
        QVERIFY(shell);
        QVERIFY(!shell->property("footer").value<QObject*>());
        auto* browser = shell->findChild<QQuickItem*>("whatsappView");
        QVERIFY(browser);
        auto* accessibleBrowser = QAccessible::queryAccessibleInterface(browser);
        auto* accessiblePane = QAccessible::queryAccessibleInterface(browser->parentItem());
        QVERIFY(accessibleBrowser && accessiblePane);
        QCOMPARE(accessibleBrowser->parent(), accessiblePane);
        const int browserIndex = accessiblePane->indexOfChild(accessibleBrowser);
        QVERIFY(browserIndex >= 0);
        QCOMPARE(accessiblePane->child(browserIndex), accessibleBrowser);
        QCOMPARE(browser->property("url").toUrl(), QUrl("about:blank"));
        auto* translation = shell->findChild<QQuickItem*>("chatTranslationButton");
        auto* settings = shell->findChild<QQuickItem*>("settingsButton");
        QVERIFY(translation && settings);
        QCOMPARE(settings->property("text").toString(), QStringLiteral("App settings"));
        for (const QString& name :
             {QStringLiteral("languages"), QStringLiteral("voice"), QStringLiteral("reading"),
              QStringLiteral("defaults"), QStringLiteral("account"), QStringLiteral("rules")}) {
            QVERIFY(QMetaObject::invokeMethod(shell, "openFixturePanel", Q_ARG(QVariant, name)));
            QTest::qWait(30);
        }
        QVERIFY(QMetaObject::invokeMethod(shell, "updateFixtureTheme", Q_ARG(QVariant, true)));
        QVERIFY(QMetaObject::invokeMethod(shell, "updateFixtureTheme", Q_ARG(QVariant, false)));
    }
    void voiceSourceCrossesOnlyTheMediaUrlBetweenWorlds() {
        EditingCheck check;
        check.root = QStringLiteral(WISP_SOURCE_DIR);
        QSignalSpy finished(&check, &EditingCheck::finished);
        QQmlApplicationEngine engine;
        engine.setInitialProperties({{"editingCheck", QVariant::fromValue(&check)}});
        engine.load(QUrl::fromLocalFile(check.root + "/tests/native/fixtures/voice.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        QTRY_VERIFY_WITH_TIMEOUT(!finished.isEmpty(), 15000);
        QVERIFY2(check.passed, qPrintable(check.detail));
    }
};
int main(int argc, char** argv) {
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    EditorTest suite;
    return QTest::qExec(&suite, argc, argv);
}
#include "editor_test.moc"
