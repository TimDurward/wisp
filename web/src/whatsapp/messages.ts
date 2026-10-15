import type { Message } from '../contracts';
import { selectors } from './selectors';
const directions = new WeakMap<HTMLElement, { id: string; direction: Message['direction'] }>();
import { textOf, utf8Limit, byteLength } from './text';
const addressId = /^(?:true|false)_([^_\s]+@(?:c\.us|s\.whatsapp\.net|g\.us|lid))_/;
const opaqueId = /^[a-f0-9]{16,128}$/i;
export function conversationFromMessageId(id: string | null) {
  const match = addressId.exec(id || '');
  return match?.[1] ?? null;
}

export function messageId(id: string | null) {
  return !!id && id.length <= 256 && (addressId.test(id) || opaqueId.test(id));
}

export function records(main: HTMLElement | null) {
  if (!main || main.closest(selectors.quote)) return [];
  // Quote subtrees are usually sparse. Collect their records once instead of
  // walking every message's ancestors for every identity/translation check.
  const quoted = new Set<Element>();
  for (const quote of main.querySelectorAll(selectors.quote)) {
    if (quote.matches(selectors.message)) quoted.add(quote);
    for (const node of quote.querySelectorAll(selectors.message)) quoted.add(node);
  }
  return [...main.querySelectorAll<HTMLElement>(selectors.message)].filter(
    (node) => !quoted.has(node) && messageId(node.getAttribute('data-id')),
  );
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
  onlyIds?: ReadonlySet<string>,
  preceding = 0,
  candidates?: readonly HTMLElement[],
): Message[] {
  if (!main) return [];
  const rows = candidates || records(main);
  const decoded = new Map<HTMLElement, Message | null>();
  function read(container: HTMLElement): Message | null {
    if (decoded.has(container)) return decoded.get(container)!;
    const value = readMessage(container, main!);
    decoded.set(container, value);
    return value;
  }
  const selected = new Set<HTMLElement>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (onlyIds && !onlyIds.has(row.getAttribute('data-id')!)) continue;
    selected.add(row);
    // Preserve the preceding *text* messages, including across media-only rows.
    if (onlyIds && preceding > 0) {
      let remaining = preceding;
      const contextIds = new Set([row.getAttribute('data-id')!]);
      for (let before = index - 1; before >= 0 && remaining > 0; before--) {
        const previous = rows[before]!;
        const message = read(previous);
        if (message && !contextIds.has(message.id)) {
          contextIds.add(message.id);
          selected.add(previous);
          remaining--;
        }
      }
    }
  }
  const result = [];
  const seen = new Set();
  for (const container of rows) {
    if (!selected.has(container)) continue;
    const message = read(container);
    if (message && !seen.has(message.id)) {
      seen.add(message.id);
      result.push(message);
    }
  }
  return result;
}

function readMessage(container: HTMLElement, main: HTMLElement): Message | null {
  const id = container.getAttribute('data-id');
  if (!id) return null;
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
  if (!text || byteLength(text) > 8000) return null;
  const element = bubble || roots[0]?.closest('[data-pre-plain-text]') || roots[0]?.parentElement;
  const direction = element ? messageDirection(container, element, main) : null;
  if (!direction || !element) return null;
  return { id, text, direction, element, container, sourceElements: roots };
}

export function context(items: Pick<Message, 'id' | 'direction' | 'text'>[], beforeId?: string) {
  const index = beforeId ? items.findIndex((m) => m.id === beforeId) : items.length;
  return items
    .slice(0, Math.max(index, 0))
    .slice(-8)
    .map((m) => ({ direction: m.direction, text: utf8Limit(m.text, 2000) }));
}

export function visible(message: Pick<Message, 'container'> & Partial<Pick<Message, 'element'>>) {
  const container = message.container.getBoundingClientRect();
  let rect = container;
  if (container.height <= 0) {
    const element =
      message.element ||
      message.container.querySelector<HTMLElement>(
        `${selectors.incoming}, ${selectors.outgoing}, [data-pre-plain-text]`,
      ) ||
      message.container.querySelector<HTMLElement>(selectors.text)?.parentElement ||
      message.container;
    rect = element.getBoundingClientRect();
  }
  const scroll = message.container.closest(
    '[role="application"], [data-testid="conversation-panel-messages"]',
  );
  const bounds = scroll?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
  return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
}
