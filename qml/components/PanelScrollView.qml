import QtQuick
import QtQuick.Templates as T

T.ScrollView {
    id: root
    clip: true
    contentWidth: availableWidth
    // Reserve a stable gutter so scrollbar visibility cannot resize wrapped
    // content recursively.
    rightPadding: 8
    bottomPadding: 0
    T.ScrollBar.horizontal: CompactScrollBar {
        objectName: "horizontalPanelScrollBar"
        policy: T.ScrollBar.AlwaysOff
        visible: false
        enabled: false
    }
    T.ScrollBar.vertical: CompactScrollBar {
        parent: root
        x: root.width - width
        y: root.topPadding
        height: root.availableHeight
        policy: T.ScrollBar.AsNeeded
        visible: root.visible && size < 1 && root.contentHeight > root.availableHeight
    }
}
