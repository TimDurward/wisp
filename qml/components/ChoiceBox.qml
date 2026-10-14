import QtQuick
import QtQuick.Templates as T
import Qt.labs.StyleKit as SK
import "../theme"

SK.ComboBox {
    id: root
    // Scrolling a settings page must not change a choice under the pointer.
    wheelEnabled: false
    contentItem: Text {
        text: root.displayText
        font: root.font
        color: root.enabled ? Tokens.ink : Tokens.muted
        textFormat: Text.PlainText
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    delegate: T.ItemDelegate {
        required property int index
        width: choices.width - (bar.visible ? bar.width : 0)
        height: 38
        padding: 10
        highlighted: root.highlightedIndex === index
        hoverEnabled: true
        contentItem: Text {
            text: root.textAt(index)
            font: root.font
            color: Tokens.ink
            textFormat: Text.PlainText
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: 4
            color: parent.highlighted || parent.hovered ? Tokens.accentTint : "transparent"
        }
    }
    popup: T.Popup {
        id: menu
        parent: T.Overlay.overlay
        padding: 4
        margins: 8
        focus: true
        closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside
        function place() {
            if (!parent)
                return;
            const anchor = root.mapToItem(parent, 0, 0);
            const below = Math.max(0, parent.height - anchor.y - root.height - 8);
            const above = Math.max(0, anchor.y - 8);
            const desired = Math.min(320, root.count * 38 + topPadding + bottomPadding);
            const opensBelow = below >= desired || below >= above;
            width = Math.min(root.width, parent.width - 16);
            height = Math.min(desired, opensBelow ? below : above);
            x = Math.max(8, Math.min(anchor.x, parent.width - width - 8));
            y = opensBelow ? anchor.y + root.height : anchor.y - height;
        }
        onAboutToShow: {
            place();
        }
        onOpened: {
            choices.positionViewAtBeginning();
            choices.positionViewAtIndex(root.currentIndex, ListView.Contain);
        }
        Connections {
            target: menu.parent
            function onWidthChanged() {
                if (menu.visible)
                    menu.place();
            }
            function onHeightChanged() {
                if (menu.visible)
                    menu.place();
            }
        }
        Connections {
            target: root
            function onXChanged() {
                if (menu.visible)
                    menu.place();
            }
            function onYChanged() {
                if (menu.visible)
                    menu.place();
            }
            function onWidthChanged() {
                if (menu.visible)
                    menu.place();
            }
            function onHeightChanged() {
                if (menu.visible)
                    menu.place();
            }
            function onCountChanged() {
                if (menu.visible)
                    menu.place();
            }
        }
        background: Rectangle {
            color: Tokens.surface
            radius: Tokens.radius
            border.width: 1
            border.color: Tokens.line
        }
        contentItem: ListView {
            id: choices
            focus: true
            Keys.forwardTo: [root]
            clip: true
            implicitHeight: contentHeight
            model: root.delegateModel
            currentIndex: root.highlightedIndex
            highlightMoveDuration: 0
            boundsBehavior: Flickable.StopAtBounds
            T.ScrollBar.vertical: CompactScrollBar {
                id: bar
                visible: size < 1 && choices.contentHeight > choices.height
            }
        }
    }
}
