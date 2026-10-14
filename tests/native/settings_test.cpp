#include <QGuiApplication>
#include <QInputMethodEvent>
#include <QJSValue>
#include <QQmlApplicationEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTest>
#include <memory>

class SettingsTest final : public QObject {
    Q_OBJECT
    std::unique_ptr<QQmlApplicationEngine> engine;
    QQuickWindow* window = nullptr;
    QVariantMap snapshot() {
        QVariant result;
        QMetaObject::invokeMethod(window, "snapshot", Q_RETURN_ARG(QVariant, result));
        return result.value<QJSValue>().toVariant().toMap();
    }
private Q_SLOTS:
    void initTestCase() {
        engine = std::make_unique<QQmlApplicationEngine>();
        engine->load(QUrl::fromLocalFile(
            QStringLiteral(WISP_SOURCE_DIR "/tests/native/fixtures/settings.qml")));
        QVERIFY(!engine->rootObjects().isEmpty());
        window = qobject_cast<QQuickWindow*>(engine->rootObjects().first());
        QVERIFY(window);
    }
    void init() { QMetaObject::invokeMethod(window, "resetFixture"); }
    void unchangedRulesCanBeSaved() {
        QMetaObject::invokeMethod(window, "begin");
        auto* save = window->findChild<QQuickItem*>("rulesSaveButton");
        QVERIFY(save);
        QTRY_VERIFY(save->isEnabled());
    }
    void rulesFollowChatIdentityAndUseNativeInput() {
        QMetaObject::invokeMethod(window, "begin");
        auto* editor = window->findChild<QQuickItem*>("rulesEditor");
        auto* save = window->findChild<QQuickItem*>("rulesSaveButton");
        QVERIFY(editor);
        QVERIFY(save);
        QTRY_VERIFY(save->isEnabled());
        editor->forceActiveFocus();
        QInputMethodEvent input;
        input.setCommitString("Keep it casual. 😊\nUse tú.");
        QCoreApplication::sendEvent(window, &input);
        QTRY_VERIFY(save->isEnabled());
        QMetaObject::invokeMethod(window, "replaceView");
        QVERIFY(save->isEnabled());
        QMetaObject::invokeMethod(window, "replaceChat");
        QVERIFY(!save->isEnabled());
        QMetaObject::invokeMethod(window, "restoreChat");
        QVERIFY(save->isEnabled());
        const auto point = save->mapToScene(QPointF(save->width() / 2, save->height() / 2));
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
        const auto result = snapshot();
        QCOMPARE(result.value("commands").toInt(), 1);
        const auto command = result.value("lastCommand").toMap();
        QCOMPARE(command.value("view_id").toString(), QStringLiteral("view-b"));
        QCOMPARE(command.value("rules").toString(), QStringLiteral("Keep it casual. 😊\nUse tú."));
    }
    void thinkingUsesNativeKeyboard() {
        QMetaObject::invokeMethod(window, "beginThinking");
        auto* thinking = window->findChild<QQuickItem*>("reasoningComboBox");
        QVERIFY(thinking);
        QTRY_VERIFY(thinking->isEnabled());
        thinking->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Down);
        const auto result = snapshot();
        QCOMPARE(result.value("commands").toInt(), 1);
        const auto choice = result.value("lastCommand").toMap();
        QCOMPARE(choice.value("type").toString(), QStringLiteral("reasoning"));
        QCOMPARE(choice.value("effort").toString(), QStringLiteral("low"));
    }
    void cleanupTestCase() {
        engine.reset();
        window = nullptr;
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    SettingsTest suite;
    return QTest::qExec(&suite, argc, argv);
}
#include "settings_test.moc"
