#ifndef WISP_TRANSLATIONCHANNEL_H
#define WISP_TRANSLATIONCHANNEL_H
#include <QObject>
#include <QPointer>
#include <QString>
namespace wisp {
class WispBridge;
class TranslationChannel final : public QObject {
    Q_OBJECT
public:
    explicit TranslationChannel(WispBridge* backend, QObject* parent = nullptr);
    void setView(QObject* view);
    int acceptedRequests() const { return acceptedRequests_; }
public Q_SLOTS:
    void submit(const QString& payload);
Q_SIGNALS:
    void translationEvent(const QString& payload);

private:
    WispBridge* backend_;
    QPointer<QObject> view_;
    int acceptedRequests_ = 0;
};
} // namespace wisp

#endif
