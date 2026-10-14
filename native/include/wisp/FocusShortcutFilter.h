#ifndef WISP_FOCUSSHORTCUTFILTER_H
#define WISP_FOCUSSHORTCUTFILTER_H
#include <QGuiApplication>
#include <QKeyEvent>
#include <QPointer>
#include <QQuickWindow>
#include <functional>

namespace wisp {
// Chromium accepts ShortcutOverride for editor formatting. Intercept both
// override and key delivery first. Qt ControlModifier is Command on macOS.
class FocusShortcutFilter final : public QObject {
public:
    FocusShortcutFilter(QQuickWindow* window, std::function<bool()> enabled,
                        std::function<void()> activated)
        : QObject(window), window_(window), enabled_(std::move(enabled)),
          activated_(std::move(activated)) {}

protected:
    bool eventFilter(QObject*, QEvent* event) override {
        if (!window_ || QGuiApplication::focusWindow() != window_ || !enabled_()) {
            return false;
        }
        if (event->type() != QEvent::ShortcutOverride && event->type() != QEvent::KeyPress &&
            event->type() != QEvent::KeyRelease) {
            return false;
        }
        auto* key = static_cast<QKeyEvent*>(event);
        if (key->key() != Qt::Key_B || key->modifiers() != Qt::ControlModifier) {
            return false;
        }
        if (event->type() == QEvent::KeyPress && !key->isAutoRepeat()) {
            activated_();
        }
        event->accept();
        return true;
    }

private:
    QPointer<QQuickWindow> window_;
    std::function<bool()> enabled_;
    std::function<void()> activated_;
};
} // namespace wisp
#endif
