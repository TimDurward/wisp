#include "wisp/TranslationChannel.h"
#include "wisp/WebOrigin.h"
#include "wisp/src/desktop/bridge.cxxqt.h"
#include <QVariant>
namespace wisp {
TranslationChannel::TranslationChannel(WispBridge* backend, QObject* parent)
    : QObject(parent), backend_(backend) {
    QObject::connect(backend, &WispBridge::pageEvent, this, [this](const QString& payload) {
        if (view_ && whatsAppOrigin(view_->property("url").toUrl())) {
            Q_EMIT translationEvent(payload);
        }
    });
}
void TranslationChannel::setView(QObject* view) { view_ = view; }
void TranslationChannel::submit(const QString& payload) {
    if (view_ && whatsAppOrigin(view_->property("url").toUrl()) && payload.size() <= 64000) {
        ++acceptedRequests_;
        backend_->pageRequest(payload);
    }
}
} // namespace wisp
