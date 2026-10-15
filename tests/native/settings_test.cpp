#include <QGuiApplication>
#include <QImage>
#include <QInputMethodEvent>
#include <QJSValue>
#include <QQmlApplicationEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QStyleHints>
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
    QQuickItem* navigationItem(int index) {
        auto* dialog = window->findChild<QObject*>("settingsDialog");
        auto* content = dialog->property("contentItem").value<QQuickItem*>();
        const QString name = "settingsNavigation" + QString::number(index);
        const auto search = [&name](auto&& self, QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == name) {
                return item;
            }
            for (auto* child : item->childItems()) {
                if (auto* found = self(self, child)) {
                    return found;
                }
            }
            return nullptr;
        };
        return search(search, content);
    }
    void clickItem(QQuickItem* item) {
        // Let Qt polish the newly opened popup and its nested layouts before
        // sampling scene coordinates; visibility alone does not imply layout.
        QTest::qWait(60);
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
    }
    void capture(const QString& name) {
        const auto directory = qEnvironmentVariable("WISP_SETTINGS_CAPTURE");
        if (!directory.isEmpty()) {
            QTest::qWait(50);
            QVERIFY(window->grabWindow().save(directory + "/" + name + ".png"));
        }
    }
private Q_SLOTS:
    void initTestCase() {
        engine = std::make_unique<QQmlApplicationEngine>();
        engine->load(QUrl::fromLocalFile(
            QStringLiteral(WISP_SOURCE_DIR "/tests/native/fixtures/settings.qml")));
        QVERIFY(!engine->rootObjects().isEmpty());
        window = qobject_cast<QQuickWindow*>(engine->rootObjects().first());
        QVERIFY(window);
        window->setProperty("captureDark", qEnvironmentVariableIsSet("WISP_SETTINGS_DARK"));
    }
    void init() { QMetaObject::invokeMethod(window, "resetFixture"); }
    void disconnectedSetupExplainsAndConnectsWithoutEnablingChat() {
        auto* banner = window->findChild<QQuickItem*>("setupBanner");
        QVERIFY(banner);
        auto* action = banner->findChild<QQuickItem*>("connectionGuideAction");
        auto* title = banner->findChild<QQuickItem*>("connectionGuideTitle");
        QVERIFY(action && title);
        QVERIFY(banner->isVisible());
        QCOMPARE(title->property("text").toString(),
                 QStringLiteral("Connect ChatGPT to translate"));
        QVERIFY(!snapshot().value("canToggle").toBool());
        clickItem(action);
        QCOMPARE(snapshot().value("lastCommand").toMap().value("type").toString(),
                 QStringLiteral("sign_in"));
        QCOMPARE(snapshot().value("commands").toInt(), 1);
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "auth"));
        QVERIFY(!action->isVisible());
        QVERIFY(title->property("text").toString().contains("browser"));
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "models"));
        QVERIFY(!action->isVisible());
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "retry"));
        QCOMPARE(action->property("text").toString(), QStringLiteral("Refresh models"));
        clickItem(action);
        QCOMPARE(snapshot().value("lastCommand").toMap().value("type").toString(),
                 QStringLiteral("refresh_models"));
        QCOMPARE(snapshot().value("commands").toInt(), 2);
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "ready"));
        QVERIFY(!banner->isVisible());
        QVERIFY(snapshot().value("canToggle").toBool());
        QCOMPARE(snapshot().value("commands").toInt(), 2);
    }
    void setupHandlesPlanAccessAndSavedTranslations() {
        auto* banner = window->findChild<QQuickItem*>("setupBanner");
        QVERIFY(banner);
        auto* action = banner->findChild<QQuickItem*>("connectionGuideAction");
        QVERIFY(action);
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "plan"));
        QCOMPARE(action->property("text").toString(), QStringLiteral("Account settings"));
        clickItem(action);
        QCOMPARE(snapshot().value("appPage").toInt(), 4);
        QCOMPARE(snapshot().value("commands").toInt(), 0);
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "unavailable"));
        QVERIFY(!action->isVisible());
        QMetaObject::invokeMethod(window, "setupStage", Q_ARG(QVariant, "cached"));
        QVERIFY(snapshot().value("canToggle").toBool());
        auto* settings = window->findChild<QObject*>("settingsDialog");
        QMetaObject::invokeMethod(settings, "close");
        QMetaObject::invokeMethod(window, "beginSetup");
        capture("chat-connection-guide");
        auto* dialog = window->findChild<QObject*>("rulesDialog");
        QVERIFY(dialog);
        auto* chatAction = dialog->findChild<QQuickItem*>("connectionGuideAction");
        QVERIFY(chatAction && chatAction->isVisible());
        QCOMPARE(chatAction->property("text").toString(), QStringLiteral("Connect ChatGPT"));
        clickItem(chatAction);
        QCOMPARE(snapshot().value("lastCommand").toMap().value("type").toString(),
                 QStringLiteral("sign_in"));
    }
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
        clickItem(save);
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
    void dropdownsFitAndReachEveryChoice_data() {
        QTest::addColumn<int>("page");
        QTest::addColumn<QString>("name");
        QTest::newRow("languages") << 0 << QStringLiteral("replyLanguageChoice");
        QTest::newRow("reading") << 2 << QStringLiteral("readingViewChoice");
    }
    void dropdownsFitAndReachEveryChoice() {
        QFETCH(int, page);
        QFETCH(QString, name);
        QMetaObject::invokeMethod(window, "beginChoices", Q_ARG(QVariant, page));
        auto* choice = window->findChild<QQuickItem*>(name);
        QVERIFY(choice);
        QTRY_VERIFY(choice->isVisible() && choice->isEnabled() && choice->width() > 0 &&
                    choice->height() > 0);
        clickItem(choice);
        auto* popup = choice->property("popup").value<QObject*>();
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("visible").toBool());
        auto* list = popup->property("contentItem").value<QQuickItem*>();
        QVERIFY(list);
        QTRY_VERIFY(list->height() >= 38);
        const auto origin = list->mapToScene(QPointF(0, 0));
        QVERIFY(origin.x() >= 8);
        QVERIFY(origin.y() >= 8);
        QVERIFY(origin.x() + list->width() <= window->width() - 8);
        QVERIFY(origin.y() + list->height() <= window->height() - 8);
        capture(name);
        if (page == 0) {
            const auto listPoint = list->mapToScene(QPointF(list->width() / 2, list->height() / 2));
            QTest::wheelEvent(window, listPoint, QPoint(0, -1200));
            QTRY_VERIFY(list->property("contentY").toReal() > 0);
        }
        QTest::keyClick(window, Qt::Key_End);
        if (page == 0) {
            QTRY_COMPARE(list->property("currentIndex").toInt(),
                         choice->property("count").toInt() - 1);
            auto* last = list->property("currentItem").value<QQuickItem*>();
            QVERIFY(last);
            const auto lastPoint = last->mapToScene(QPointF(last->width() / 2, last->height() / 2));
            QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, lastPoint.toPoint());
        } else {
            QTest::keyClick(window, Qt::Key_Return);
        }
        QTRY_VERIFY(!popup->property("visible").toBool());
        QCOMPARE(choice->property("currentIndex").toInt(), choice->property("count").toInt() - 1);
    }
    void closedDropdownWheelDoesNotChangeSelection() {
        QMetaObject::invokeMethod(window, "beginThinking");
        auto* choice = window->findChild<QQuickItem*>("reasoningComboBox");
        QVERIFY(choice);
        QTRY_VERIFY(choice->isVisible() && choice->isEnabled() && choice->width() > 0 &&
                    choice->height() > 0);
        const int before = choice->property("currentIndex").toInt();
        const auto point = choice->mapToScene(QPointF(choice->width() / 2, choice->height() / 2));
        QTest::wheelEvent(window, point, QPoint(0, -120));
        QCOMPARE(choice->property("currentIndex").toInt(), before);
        QCOMPARE(snapshot().value("commands").toInt(), 0);
    }
    void dropdownAtWindowEdgeOpensAboveAndResizes() {
        QMetaObject::invokeMethod(window, "beginEdgeChoice");
        auto* choice = window->findChild<QQuickItem*>("edgeChoice");
        QVERIFY(choice);
        QTRY_VERIFY(choice->isVisible());
        clickItem(choice);
        auto* popup = choice->property("popup").value<QObject*>();
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("visible").toBool());
        auto* list = popup->property("contentItem").value<QQuickItem*>();
        QVERIFY(list);
        QTRY_VERIFY(list->height() >= 38);
        QVERIFY(list->mapToScene(QPointF(0, list->height())).y() <=
                choice->mapToScene(QPointF(0, 0)).y());
        window->resize(480, 300);
        QTRY_VERIFY(list->mapToScene(QPointF(0, 0)).y() >= 8);
        QTRY_VERIFY(list->mapToScene(QPointF(list->width(), list->height())).y() <=
                    choice->mapToScene(QPointF(0, 0)).y());
        capture("edgeChoice");
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!popup->property("visible").toBool());
    }
    void customLanguagesUseNativeInputAndAreSelectable_data() {
        QTest::addColumn<QString>("target");
        QTest::addColumn<QString>("language");
        QTest::addColumn<QString>("regionName");
        QTest::newRow("no-region")
            << QStringLiteral("reply") << QStringLiteral("Swahili") << QString();
        QTest::newRow("reading") << QStringLiteral("reading") << QStringLiteral("Tamil")
                                 << QStringLiteral("Sri Lanka");
        QTest::newRow("reply") << QStringLiteral("reply") << QStringLiteral("Tamil")
                               << QStringLiteral("Sri Lanka");
    }
    void customLanguagesUseNativeInputAndAreSelectable() {
        QFETCH(QString, target);
        QFETCH(QString, language);
        QFETCH(QString, regionName);
        QMetaObject::invokeMethod(window, "beginCustomLanguage", Q_ARG(QVariant, target));
        auto* name = window->findChild<QQuickItem*>("customLanguageName");
        auto* region = window->findChild<QQuickItem*>("customLanguageRegion");
        auto* save = window->findChild<QQuickItem*>("customLanguageSave");
        auto* dialog = window->findChild<QObject*>("customLanguageDialog");
        QVERIFY(name);
        QVERIFY(region);
        QVERIFY(save);
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QVERIFY(!save->isEnabled());
        name->forceActiveFocus();
        QInputMethodEvent languageInput;
        languageInput.setCommitString(language);
        QCoreApplication::sendEvent(window, &languageInput);
        region->forceActiveFocus();
        QInputMethodEvent regionInput;
        regionInput.setCommitString(regionName);
        QCoreApplication::sendEvent(window, &regionInput);
        QTRY_VERIFY(save->isEnabled());
        capture("customLanguageDialog");
        const auto point = save->mapToScene(QPointF(save->width() / 2, save->height() / 2));
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
        QCOMPARE(snapshot().value("commands").toInt(), 1);
        const auto added = snapshot().value("lastCommand").toMap();
        QCOMPARE(added.value("type").toString(), QStringLiteral("add_language"));
        QCOMPARE(added.value("name").toString(), language);
        QCOMPARE(added.value("region").toString(), regionName);
        QVERIFY(!save->isEnabled());
        QMetaObject::invokeMethod(window, "finishLanguageAddition");
        QTRY_VERIFY(!dialog->property("visible").toBool());
        auto* choice = window->findChild<QQuickItem*>(target == "reading" ? "readingLanguageChoice"
                                                                          : "replyLanguageChoice");
        QVERIFY(choice);
        const auto label = regionName.isEmpty() ? language : language + " · " + regionName;
        QTRY_COMPARE(choice->property("currentText").toString(), label);
        QMetaObject::invokeMethod(window, "applyLanguages");
        const auto preferences =
            snapshot().value("lastCommand").toMap().value("preferences").toMap();
        const auto selected = preferences.value(target + "_language").toMap();
        QCOMPARE(selected.value("name").toString(), language);
        QCOMPARE(selected.value("region").toString(), regionName);
    }
    void addingExistingPresetSelectsItWithoutDuplicating() {
        QMetaObject::invokeMethod(window, "beginCustomLanguage",
                                  Q_ARG(QVariant, QStringLiteral("reply")));
        auto* name = window->findChild<QQuickItem*>("customLanguageName");
        auto* save = window->findChild<QQuickItem*>("customLanguageSave");
        auto* dialog = window->findChild<QObject*>("customLanguageDialog");
        QVERIFY(name && save && dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        name->setProperty("text", QStringLiteral(" french "));
        const auto point = save->mapToScene(QPointF(save->width() / 2, save->height() / 2));
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(snapshot().value("commands").toInt(), 0);
        auto* choice = window->findChild<QQuickItem*>("replyLanguageChoice");
        QVERIFY(choice);
        QTRY_COMPARE(choice->property("currentText").toString(), QStringLiteral("French"));
        QCOMPARE(choice->property("count").toInt(), 10);
    }
    void cancellingCustomLanguageDoesNotChangePreferences() {
        QMetaObject::invokeMethod(window, "beginCustomLanguage",
                                  Q_ARG(QVariant, QStringLiteral("reply")));
        auto* dialog = window->findChild<QObject*>("customLanguageDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(snapshot().value("commands").toInt(), 0);
    }
    void voiceSettingsStartOptionalAndLengthChangesUseNativeCommands() {
        QMetaObject::invokeMethod(window, "beginChoices", Q_ARG(QVariant, 1));
        auto* toggle = window->findChild<QQuickItem*>("voiceTranslationSwitch");
        auto* length = window->findChild<QQuickItem*>("voiceLengthChoice");
        auto* automatic = window->findChild<QQuickItem*>("voiceAutomaticSwitch");
        QVERIFY(automatic);
        QVERIFY(automatic->property("checked").toBool());
        QVERIFY(!automatic->property("enabled").toBool());
        auto* details = window->findChild<QQuickItem*>("voiceDetails");
        QVERIFY(details);
        QVERIFY(!details->property("visible").toBool());
        QVERIFY(toggle);
        QVERIFY(length);
        QVERIFY(!toggle->property("checked").toBool());
        QCOMPARE(length->property("count").toInt(), 4);
        QCOMPARE(length->property("currentValue").toInt(), 10);
        length->setProperty("currentIndex", 3);
        QVERIFY(QMetaObject::invokeMethod(length, "activated", Q_ARG(int, 3)));
        const auto command = snapshot().value("lastCommand").toMap();
        QCOMPARE(command.value("type").toString(), QStringLiteral("voice_max_minutes"));
        QCOMPARE(command.value("minutes").toInt(), 30);
        automatic->setProperty("checked", false);
        QVERIFY(QMetaObject::invokeMethod(automatic, "toggled"));
        const auto autoCommand = snapshot().value("lastCommand").toMap();
        QCOMPARE(autoCommand.value("type").toString(), QStringLiteral("voice_auto"));
        QCOMPARE(autoCommand.value("enabled").toBool(), false);
        capture("voice-settings");
    }
    void appearanceFollowsWhatsAppAndDarkSurfacesAreNeutral() {
        QMetaObject::invokeMethod(window, "setAppearance", Q_ARG(QVariant, true));
        QCOMPARE(snapshot().value("surface").toString(), QStringLiteral("#1b1b1b"));
        QCOMPARE(snapshot().value("ink").toString(), QStringLiteral("#eeeeee"));
        QMetaObject::invokeMethod(window, "setAppearance", Q_ARG(QVariant, false));
        QCOMPARE(snapshot().value("surface").toString(), QStringLiteral("#ffffff"));
        QCOMPARE(snapshot().value("ink").toString(), QStringLiteral("#202020"));
    }
    void shellSeparatesChatTranslationFromAppSettings() {
        auto* translation = window->findChild<QQuickItem*>("chatTranslationButton");
        auto* appSettings = window->findChild<QQuickItem*>("settingsButton");
        auto* chats = window->findChild<QQuickItem*>("showChatsButton");
        QVERIFY(translation && appSettings && chats);
        QVERIFY(!window->findChild<QQuickItem*>("connectionButton"));
        QCOMPARE(snapshot().value("headerHeight").toInt(), 44);
        QVERIFY(!chats->isVisible());
        QMetaObject::invokeMethod(window, "setFocus", Q_ARG(QVariant, true));
        QTRY_VERIFY(chats->isVisible());
        QMetaObject::invokeMethod(window, "setFocus", Q_ARG(QVariant, false));
        QTRY_VERIFY(!chats->isVisible());
        QMetaObject::invokeMethod(window, "beginTranslation");
        QVERIFY(snapshot().value("chatVisible").toBool());
        QVERIFY(!snapshot().value("customRulesVisible").toBool());
        auto* toggle = window->findChild<QQuickItem*>("conversationTranslationSwitch");
        QVERIFY(toggle && toggle->isVisible() && toggle->isEnabled());
        clickItem(toggle);
        const auto command = snapshot().value("lastCommand").toMap();
        QCOMPARE(command.value("type").toString(), QStringLiteral("enable"));
        QCOMPARE(command.value("view_id").toString(), QStringLiteral("view-a"));
        QCOMPARE(command.value("enabled").toBool(), true);
        capture("quiet-chat-translation");
    }
    void settingsSidebarHasFiveScopedSectionsAndPreservesDrafts() {
        QMetaObject::invokeMethod(window, "showAppPage", Q_ARG(QVariant, 0));
        QVERIFY(snapshot().value("globalVisible").toBool());
        auto* language = window->findChild<QQuickItem*>("replyLanguageChoice");
        QVERIFY(language && language->isVisible());
        language->setProperty("currentIndex", 3);
        QVERIFY(QMetaObject::invokeMethod(language, "activated", Q_ARG(int, 3)));
        auto* voiceNav = navigationItem(1);
        QTRY_VERIFY(voiceNav && voiceNav->isVisible());
        QVERIFY(QMetaObject::invokeMethod(voiceNav, "clicked"));
        QCOMPARE(snapshot().value("appPage").toInt(), 1);
        auto* voice = window->findChild<QQuickItem*>("voiceTranslationSwitch");
        QTRY_VERIFY(voice && voice->isVisible());
        QVERIFY(!language->isVisible());
        const auto bars = window->findChildren<QQuickItem*>("horizontalPanelScrollBar");
        QVERIFY(!bars.isEmpty());
        for (auto* bar : bars) {
            auto* thumb = bar->property("contentItem").value<QQuickItem*>();
            QVERIFY(thumb && !thumb->isVisible());
        }
        capture("quiet-voice-settings");
        QMetaObject::invokeMethod(window, "showAppPage", Q_ARG(QVariant, 0));
        QCOMPARE(language->property("currentIndex").toInt(), 3);
        capture("quiet-language-settings");
        for (int index = 0; index < 5; ++index) {
            auto* navigation = navigationItem(index);
            QVERIFY(navigation && navigation->isVisible());
        }
    }
    void unsavedChatRulesSurviveClosingAndReopeningTheSameChat() {
        QMetaObject::invokeMethod(window, "begin");
        auto* editor = window->findChild<QQuickItem*>("rulesEditor");
        QVERIFY(editor);
        editor->setProperty("text", QStringLiteral("Keep this draft."));
        auto* dialog = window->findChild<QObject*>("rulesDialog");
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        QMetaObject::invokeMethod(window, "beginTranslation");
        QCOMPARE(editor->property("text").toString(), QStringLiteral("Keep this draft."));
        QVERIFY(snapshot().value("customRulesVisible").toBool());
        QMetaObject::invokeMethod(window, "replaceChat");
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        QMetaObject::invokeMethod(window, "beginTranslation");
        QCOMPARE(editor->property("text").toString(), QString());
    }
    void accountIdentityFollowsActiveSignInAndSidebarReachesPanelEdges() {
        QMetaObject::invokeMethod(window, "beginAccount");
        auto* card = window->findChild<QQuickItem*>("accountConnectionCard");
        auto* sidebar = window->findChild<QQuickItem*>("settingsSidebar");
        auto* divider = window->findChild<QQuickItem*>("settingsSidebarDivider");
        auto* headerDivider = window->findChild<QQuickItem*>("settingsHeaderDivider");
        auto* dialog = window->findChild<QObject*>("settingsDialog");
        QVERIFY(card && sidebar && divider && headerDivider && dialog);
        QCOMPARE(card->property("heading").toString(), QStringLiteral("ChatGPT connected"));
        QCOMPARE(card->property("description").toString(), QStringLiteral("person@example.com"));
        auto* content = dialog->property("contentItem").value<QQuickItem*>();
        QVERIFY(content);
        for (int height : {660, 480}) {
            window->setHeight(height);
            QTest::qWait(60);
            const auto origin = content->mapToScene(QPointF(0, 0));
            const auto sidebarBottom = sidebar->mapToScene(QPointF(0, sidebar->height()));
            const auto dividerBottom = divider->mapToScene(QPointF(0, divider->height()));
            QVERIFY(qAbs(sidebarBottom.y() - (origin.y() + content->height())) < 1);
            QVERIFY(qAbs(dividerBottom.y() - sidebarBottom.y()) < 1);
            QVERIFY(qAbs(headerDivider->mapToScene(QPointF(0, 0)).x() - origin.x()) < 1);
            QVERIFY(qAbs(headerDivider->width() - content->width()) < 1);
        }
        window->setHeight(660);
        capture("quiet-account-settings");
        QMetaObject::invokeMethod(window, "setAccount", Q_ARG(QVariant, "account-b"),
                                  Q_ARG(QVariant, true));
        auto* accounts = window->findChild<QQuickItem*>("accountChoice");
        QVERIFY(accounts && accounts->isVisible());
        QCOMPARE(accounts->property("currentText").toString(), QStringLiteral("work@example.org"));
        // The account picker supplies the identity when there are several
        // accounts, instead of repeating the same email above it.
        QCOMPARE(card->property("description").toString(), QString());
        QMetaObject::invokeMethod(window, "setAccount", Q_ARG(QVariant, "account-b"),
                                  Q_ARG(QVariant, false));
        QCOMPARE(card->property("heading").toString(), QStringLiteral("Connect ChatGPT"));
        QVERIFY(!card->property("description").toString().contains("work@example.org"));
    }
    void cleanupTestCase() {
        engine.reset();
        window = nullptr;
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (qEnvironmentVariableIsSet("WISP_SETTINGS_DARK")) {
        app.styleHints()->setColorScheme(Qt::ColorScheme::Dark);
    }
    SettingsTest suite;
    return QTest::qExec(&suite, argc, argv);
}
#include "settings_test.moc"
