import QtQuick
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK

T.ScrollView {
    id: root
    clip: true
    contentWidth: availableWidth
    // Reserve a stable gutter so scrollbar visibility cannot resize wrapped
    // content recursively. Template attachments keep the bars in StyleKit.
    rightPadding: 8
    bottomPadding: 0
    T.ScrollBar.vertical: SK.ScrollBar {
        parent: root
        x: root.width - width
        y: root.topPadding
        height: root.availableHeight
        policy: T.ScrollBar.AsNeeded
        visible: root.visible && size < 1 && root.contentHeight > root.availableHeight
    }
}
