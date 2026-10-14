import QtQuick
import QtQuick.Templates as T
import "../theme"

T.ScrollBar {
    id: root
    implicitWidth: 8
    implicitHeight: 8
    padding: 2
    minimumSize: 0.08
    policy: T.ScrollBar.AsNeeded
    contentItem: Rectangle {
        visible: root.policy !== T.ScrollBar.AlwaysOff && root.size < 1
        implicitWidth: 4
        implicitHeight: 4
        radius: 2
        color: Qt.alpha(Tokens.muted, root.pressed ? 0.8 : root.hovered ? 0.65 : 0.45)
    }
}
