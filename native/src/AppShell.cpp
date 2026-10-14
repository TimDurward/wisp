#include "wisp/AppShell.h"
#include "wisp/DesktopController.h"
#include "wisp/FocusShortcutFilter.h"
#include "wisp/TranslationChannel.h"
#include "wisp/src/desktop/bridge.cxxqt.h"
#include <QDir>
#include <QGuiApplication>
#include <QIcon>
#include <QImage>
#include <QLockFile>
#include <QPainter>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QSvgRenderer>
#include <QTimer>
#include <QVariant>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>
#include <cstdio>
namespace wisp {
int runApp(bool smoke, bool diagnostics, QString screenshot, QString dataDir, QString iconExport,
           QString capturePanel) {
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QtWebEngineQuick::initialize();
    int argc = 1;
    char name[] = "Wisp";
    char* argv[] = {name, nullptr};
    QGuiApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("Wisp"));
    app.setApplicationName(QStringLiteral("Wisp"));
    app.setApplicationVersion(QString::fromLatin1(WISP_APP_VERSION));
    app.setWindowIcon(QIcon(QStringLiteral(":/wisp/assets/wisp.svg")));
    if (!iconExport.isEmpty()) {
        QImage image(1024, 1024, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        QPainter painter(&image);
        QSvgRenderer svg(QStringLiteral(":/wisp/assets/wisp.svg"));
        svg.render(&painter);
        painter.end();
        return image.save(iconExport) ? 0 : 1;
    }
    if (dataDir.isEmpty()) {
        dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    }
    if (!QDir().mkpath(dataDir)) {
        fprintf(stderr, "Wisp could not create its data directory.\n");
        return 1;
    }
    QLockFile lock(dataDir + QStringLiteral("/wisp.lock"));
    if (!lock.tryLock()) {
        fprintf(stderr, "Wisp is already using this profile.\n");
        return 1;
    }
    WispBridge backend;
    DesktopController desktop(&backend, dataDir, smoke || diagnostics);
    TranslationChannel channel(&backend);
    backend.initialize(dataDir);
    QQmlApplicationEngine qml;
    qml.setInitialProperties(
        {{QStringLiteral("desktop"), QVariant::fromValue(&desktop)},
         {QStringLiteral("translationChannel"), QVariant::fromValue(&channel)}});
    qml.load(QUrl(QStringLiteral("qrc:/wisp/qml/Main.qml")));
    if (qml.rootObjects().isEmpty()) {
        return 2;
    }
    auto* window = qobject_cast<QQuickWindow*>(qml.rootObjects().first());
    if (!window) {
        return 2;
    }
    channel.setView(window->findChild<QObject*>(QStringLiteral("whatsappView")));
    desktop.setView(window->findChild<QObject*>(QStringLiteral("whatsappView")));
    auto* focusShortcut = new FocusShortcutFilter(
        window, [&desktop] { return desktop.property("focusShortcutEnabled").toBool(); },
        [&desktop] { Q_EMIT desktop.focusShortcutRequested(); });
    app.installEventFilter(focusShortcut);
    if (diagnostics) {
        auto* timer = new QTimer(&app);
        QObject::connect(timer, &QTimer::timeout, window,
                         [window] { QMetaObject::invokeMethod(window, "reportStructure"); });
        timer->start(3000);
    }
    if (smoke) {
        QTimer::singleShot(13000, &app,
                           [window] { QMetaObject::invokeMethod(window, "reportStructure"); });
    }
    if (smoke && !capturePanel.isEmpty()) {
        QTimer::singleShot(11000, &app, [window, capturePanel] {
            window->resize(window->minimumSize());
            QMetaObject::invokeMethod(window, "capturePanel",
                                      Q_ARG(QVariant, QVariant(capturePanel)));
        });
    }
    if (smoke) {
        QTimer::singleShot(15000, &app, [&] {
            const bool saved = screenshot.isEmpty() || window->grabWindow().save(screenshot);
            fprintf(stdout,
                    "Wisp StyleKit UI loaded; isolated translation bridge requests: %d; screenshot "
                    "saved: %s\n",
                    channel.acceptedRequests(), saved ? "yes" : "no");
            app.exit(saved && channel.acceptedRequests() > 0 ? 0 : 1);
        });
    }
    return app.exec();
}
} // namespace wisp
