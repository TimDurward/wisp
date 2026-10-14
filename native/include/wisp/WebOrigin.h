#ifndef WISP_WEBORIGIN_H
#define WISP_WEBORIGIN_H
#include <QUrl>
namespace wisp {
inline bool externalWebUrl(const QUrl& url) {
    return url.isValid() && !url.host().isEmpty() &&
           (url.scheme() == QStringLiteral("https") || url.scheme() == QStringLiteral("http")) &&
           url.userName().isEmpty() && url.password().isEmpty();
}
inline bool whatsAppOrigin(const QUrl& url) {
    return url.scheme() == QStringLiteral("https") &&
           url.host() == QStringLiteral("web.whatsapp.com") &&
           (url.port() == -1 || url.port() == 443) && url.userName().isEmpty() &&
           url.password().isEmpty();
}
} // namespace wisp

#endif
