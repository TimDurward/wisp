import type { Message } from '../contracts';
import { selectors } from './selectors';
const directions = new WeakMap<HTMLElement, { id: string; direction: Message['direction'] }>();
import { textOf, utf8Limit, byteLength } from './text';
export function conversationFromMessageId(id: string | null) {
  const match = /^(?:true|false)_([^_\s]+@(?:c\.us|s\.whatsapp\.net|g\.us|lid))_/.exec(id || '');
  return match?.[1] ?? null;
}

export function messageId(id: string | null) {
  return (
    !!id &&
    id.length <= 256 &&
    (conversationFromMessageId(id) !== null || /^[a-f0-9]{16,128}$/i.test(id))
  );
}

export function records(main: HTMLElement | null) {
  return main
    ? [...main.querySelectorAll<HTMLElement>(selectors.message)].filter(
        (node) => messageId(node.getAttribute('data-id')) && !node.closest(selectors.quote),
      )
    : [];
}

export function messageDirection(container: HTMLElement, element: HTMLElement, main: HTMLElement) {
  const id = container.getAttribute('data-id');
  if (!id) return null;
  const bubble = container.matches(`${selectors.incoming}, ${selectors.outgoing}`)
    ? container
    : container.querySelector<HTMLElement>(`${selectors.incoming}, ${selectors.outgoing}`);
  const known = directions.get(container);
  const translated = !!element.querySelector('.wisp-inline, .wisp-voice');
  let direction: Message['direction'] | null = bubble
    ? bubble.matches(selectors.incoming)
      ? 'incoming'
      : 'outgoing'
    : translated && known?.id === id
      ? known.direction
      : null;
  if (!direction && /^(true|false)_/.test(id))
    direction = id.startsWith('true_') ? 'outgoing' : 'incoming';
  if (!direction) {
    const hasVoiceMarker = (marker: string) =>
      [...container.querySelectorAll(`[data-icon="${marker}"]`)].some(
        (node) => !node.closest(selectors.quote + ', [data-wisp]'),
      );
    const incoming = hasVoiceMarker('ptt-incoming'),
      outgoing = hasVoiceMarker('ptt-outgoing');
    if (incoming !== outgoing) direction = incoming ? 'incoming' : 'outgoing';
  }
  if (!direction) {
    const bounds = main.getBoundingClientRect(),
      rect = element.getBoundingClientRect();
    const left = rect.left - bounds.left,
      right = bounds.right - rect.right;
    if (rect.width > 0 && bounds.width > 0 && Math.abs(left - right) >= 16)
      direction = right < left ? 'outgoing' : 'incoming';
  }
  if (direction) directions.set(container, { id, direction });
  return direction;
}

export function messages(
  main: HTMLElement | null = document.querySelector<HTMLElement>(selectors.main),
): Message[] {
  if (!main) return [];
  const result = [];
  const seen = new Set();
  for (const container of records(main)) {
    const id = container.getAttribute('data-id');
    if (!id) continue;
    if (seen.has(id)) continue;
    const bubble = container.matches(`${selectors.incoming}, ${selectors.outgoing}`)
      ? container
      : container.querySelector<HTMLElement>(`${selectors.incoming}, ${selectors.outgoing}`);
    const scope = bubble || container;
    const textNodes = [
      ...(scope.matches(selectors.text) ? [scope] : []),
      ...scope.querySelectorAll<HTMLElement>(selectors.text),
    ].filter((node) => !node.closest(selectors.quote));
    const roots = textNodes.filter(
      (node) => !textNodes.some((other) => other !== node && other.contains(node)),
    );
    const text = roots.map(textOf).join('\n').trim();
    if (!text || byteLength(text) > 8000) continue;
    const element = bubble || roots[0]?.closest('[data-pre-plain-text]') || roots[0]?.parentElement;
    const direction = element ? messageDirection(container, element, main) : null;
    if (!direction || !element) continue;
    seen.add(id);
    result.push({ id, text, direction, element, container, sourceElements: roots });
  }
  return result;
}

export function context(items: Pick<Message, 'id' | 'direction' | 'text'>[], beforeId?: string) {
  const index = beforeId ? items.findIndex((m) => m.id === beforeId) : items.length;
  return items
    .slice(0, Math.max(index, 0))
    .slice(-8)
    .map((m) => ({ direction: m.direction, text: utf8Limit(m.text, 2000) }));
}

export function visible(message: Message) {
  const container = message.container.getBoundingClientRect();
  const rect = container.height > 0 ? container : message.element.getBoundingClientRect();
  const scroll = message.container.closest(
    '[role="application"], [data-testid="conversation-panel-messages"]',
  );
  const bounds = scroll?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
  return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
}
