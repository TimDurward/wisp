pragma Singleton
import QtQuick

QtObject {
    property var browserDark: null
    readonly property bool dark: browserDark === null ? Application.styleHints.colorScheme === Qt.Dark : browserDark
    readonly property color canvas: dark ? "#161616" : "#f7f7f7"
    readonly property color surface: dark ? "#1b1b1b" : "#ffffff"
    readonly property color raised: dark ? "#292929" : "#f3f3f3"
    readonly property color ink: dark ? "#eeeeee" : "#202020"
    readonly property color muted: dark ? "#aaaaaa" : "#707070"
    readonly property color line: dark ? "#353535" : "#e2e2e2"
    readonly property color accent: dark ? "#64c8af" : "#167d69"
    readonly property color accentFill: dark ? "#216c5c" : "#167d69"
    readonly property color accentTint: dark ? "#1b3e36" : "#e7f4ed"
    readonly property color warning: dark ? "#e4b78d" : "#9a633d"
    readonly property int radius: 8
    readonly property int gap: 16
}
