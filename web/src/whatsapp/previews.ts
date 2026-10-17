import { textOf } from './text';

const sidebar = '#pane-side, [data-testid="chat-list"]';
export interface SidebarChat {
  element: HTMLElement;
  title: HTMLElement;
  avatar: HTMLImageElement | null;
  identity: string;
}

export function previewText(text: string) {
  return text
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sidebarChat(selection: HTMLElement | null): SidebarChat | null {
  if (!selection?.isConnected || !selection.closest(sidebar)) return null;
  const element =
    selection.closest<HTMLElement>('[role="row"], [role="listitem"]') ||
    selection.closest<HTMLElement>('[data-testid="cell-frame-container"]') ||
    selection;
  const title = element.querySelector<HTMLElement>(
    '[data-testid="cell-frame-title"], [data-testid="cell-frame-primary"] span[title], span[title]',
  );
  if (!title || title.closest('[data-wisp]') || !textOf(title)) return null;
  const avatar = element.querySelector<HTMLImageElement>('img');
  // These are guards against row recycling, never a lookup by display name.
  // Only the selected DOM row can be associated with a validated conversation.
  return {
    element,
    title,
    avatar,
    identity: JSON.stringify([
      element.getAttribute('data-id'),
      title.getAttribute('title'),
      textOf(title),
      avatar?.getAttribute('src'),
    ]),
  };
}

export function previewSources(chat: SidebarChat) {
  const secondary = chat.element.querySelector<HTMLElement>('[data-testid="cell-frame-secondary"]');
  const titleBounds = secondary ? null : chat.title.getBoundingClientRect();
  return [
    ...(secondary || chat.element).querySelectorAll<HTMLElement>(
      'span[title], [data-testid="last-msg-text"]',
    ),
  ].filter((node) => {
    const button = node.closest('button, [role="button"]');
    if (
      node.closest('[data-wisp]') ||
      (button && !button.contains(chat.title)) ||
      node === chat.title ||
      chat.title.contains(node) ||
      node.contains(chat.title)
    )
      return false;
    // Newer markup omits test IDs. Its message line must still sit below the
    // contact name; timestamps and badges on the title line are never previews.
    if (titleBounds) {
      const visible = node.nextElementSibling?.matches('.wisp-chat-preview')
        ? node.nextElementSibling
        : node;
      const bounds = visible.getBoundingClientRect();
      if (!bounds.height || !titleBounds.height || bounds.top < titleBounds.bottom - 2)
        return false;
    }
    return true;
  });
}

export function previewSourceText(node: HTMLElement) {
  return previewText(textOf(node));
}
