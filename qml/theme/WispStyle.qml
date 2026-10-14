import QtQuick
import Qt.labs.StyleKit
import "."

Style {
    control {
        padding: 10
        spacing: 8
        text.pointSize: 10.5
        text.color: Tokens.ink
        background {
            implicitWidth: 110
            implicitHeight: 38
            radius: Tokens.radius
            color: Tokens.surface
            border.width: 1
            border.color: Tokens.line
        }
        disabled.text.color: Tokens.muted
        disabled.background.opacity: 0.6
        hovered.background.color: Tokens.raised
        focused.background.border.color: Tokens.accent
    }
    button {
        text.bold: true
        background.color: Tokens.accentFill
        background.border.color: Tokens.accentFill
        text.color: "#ffffff"
        hovered.background.color: Qt.darker(Tokens.accentFill, 1.08)
        pressed.background.color: Qt.darker(Tokens.accentFill, 1.18)
    }
    toolButton {
        background.color: Qt.alpha(Tokens.surface, 0)
        background.border.width: 0
        text.color: Tokens.ink
        hovered.background.color: Tokens.raised
        checked.background.color: Tokens.raised
    }
    comboBox {
        background.implicitWidth: 230
    }
    tabBar {
        padding: 0
        background.visible: false
    }
    tabButton {
        checked.background.color: Tokens.accentTint
        checked.background.border.color: Tokens.accent
        checked.text.color: Tokens.accent
    }
    switchControl {
        indicator {
            implicitWidth: 34
            implicitHeight: 20
            radius: 10
            color: Tokens.line
            border.width: 1
            border.color: Tokens.line
            foreground.visible: false
        }
        handle {
            implicitWidth: 16
            implicitHeight: 16
            radius: 8
            color: "#ffffff"
        }
        checked.indicator.color: Tokens.accentFill
        checked.indicator.border.color: Tokens.accentFill
    }
    progressBar {
        background.implicitHeight: 2
        indicator.color: Tokens.accent
        indicator.implicitHeight: 2
    }
    popup {
        padding: 16
    }
    scrollView {
        padding: 0
        background.visible: false
    }
    scrollBar {
        padding: 0
        background.implicitWidth: 8
        background.implicitHeight: 8
        background.visible: false
        indicator.implicitWidth: Style.Stretch
        indicator.implicitHeight: 4
        indicator.radius: 2
        indicator.color: Qt.alpha(Tokens.muted, 0.45)
        indicator.margins: 2
        indicator.border.width: 0
        indicator.foreground.visible: false
        vertical {
            indicator.implicitWidth: 4
            indicator.implicitHeight: Style.Stretch
        }
    }
    light: Theme {
        applicationWindow.background.color: Tokens.canvas
    }
    dark: Theme {
        applicationWindow.background.color: Tokens.canvas
    }
}
