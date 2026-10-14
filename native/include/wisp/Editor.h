#ifndef WISP_EDITOR_H
#define WISP_EDITOR_H
#include <QCoreApplication>
#include <QInputMethodEvent>
#include <QQuickItem>
#include <QQuickWindow>

namespace wisp {
// Public Qt input delivery preserves Chromium/WhatsApp's own editor state.
// The caller validates the completed translation and DOM selection first.
inline bool commitEditorText(QQuickItem* view, const QString& text) {
    if (!view || !view->window() || text.isEmpty()) {
        return false;
    }
    QQuickItem* target = view->window()->activeFocusItem();
    if (!target || (target != view && !view->isAncestorOf(target)) ||
        !target->flags().testFlag(QQuickItem::ItemAcceptsInputMethod)) {
        return false;
    }
    QInputMethodEvent event;
    event.setCommitString(text);
    return QCoreApplication::sendEvent(target, &event);
}
} // namespace wisp
#endif
