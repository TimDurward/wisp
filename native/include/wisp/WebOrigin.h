#ifndef WISP_WEBORIGIN_H
#define WISP_WEBORIGIN_H
#include <QStringList>
#include <QUrl>
#include <QUrlQuery>
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
inline bool chatGptAuthUrl(const QUrl& url) {
    return externalWebUrl(url) && url.scheme() == QStringLiteral("https") &&
           url.host() == QStringLiteral("auth.openai.com") &&
           (url.port() == -1 || url.port() == 443) &&
           url.path() == QStringLiteral("/api/accounts/authorize") && !url.hasFragment();
}
inline bool copyableChatGptAuthUrl(const QUrl& url) {
    if (!chatGptAuthUrl(url)) {
        return false;
    }
    const QUrlQuery query(url);
    if (query.queryItemValue(QStringLiteral("client_id")) !=
        QStringLiteral("dynamic_agent_client")) {
        return false;
    }
    // Only fresh registration links can be copied. Returning sign-in links may
    // contain a retained ID token, which must stay out of the clipboard and QML.
    const QStringList allowed = {"client_id",
                                 "ext_agent_host_id",
                                 "response_type",
                                 "redirect_uri",
                                 "scope",
                                 "resource",
                                 "state",
                                 "nonce",
                                 "code_challenge_method",
                                 "code_challenge",
                                 "agent_name_hint"};
    for (const auto& item : query.queryItems()) {
        if (!allowed.contains(item.first)) {
            return false;
        }
    }
    return true;
}
} // namespace wisp

#endif
