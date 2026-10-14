pragma Singleton
import QtQuick

QtObject {
    readonly property bool dark: Application.styleHints.colorScheme === Qt.Dark
    readonly property color canvas: dark ? "#111b21" : "#f7f9f8"
    readonly property color surface: dark ? "#1b272d" : "#ffffff"
    readonly property color raised: dark ? "#24333a" : "#f0f5f3"
    readonly property color ink: dark ? "#edf5f2" : "#203b37"
    readonly property color muted: dark ? "#a2b4b3" : "#718581"
    readonly property color line: dark ? "#304149" : "#dfe8e4"
    readonly property color accent: dark ? "#64c8af" : "#167d69"
    readonly property color accentFill: dark ? "#216c5c" : "#167d69"
    readonly property color accentTint: dark ? "#1b3e36" : "#e7f4ed"
    readonly property color warning: dark ? "#e4b78d" : "#9a633d"
    readonly property int radius: 8
    readonly property int gap: 16
}
