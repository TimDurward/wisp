import { install, element, button } from './dom';
import { linkedText } from './links';
import type { Message, ReadingOptions } from '../contracts';
let originalPopup: HTMLDivElement | null = null,
  popupOwner: HTMLButtonElement | null = null,
  popupPinned = false,
  closeTimer: number | undefined;
function keepOriginal() {
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}
function deferHide(event: MouseEvent | FocusEvent) {
  if (
    popupPinned ||
    originalPopup?.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null) ||
    popupOwner?.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)
  )
    return;
  keepOriginal();
  closeTimer = window.setTimeout(hideOriginal, 240);
}
function hideOriginal() {
  keepOriginal();
  if (originalPopup?.hidePopover) originalPopup.hidePopover();
  if (originalPopup) originalPopup.hidden = true;
  popupOwner?.setAttribute('aria-expanded', 'false');
  popupOwner = null;
  popupPinned = false;
}
export function positionOriginal() {
  if (!originalPopup || !popupOwner?.isConnected) {
    hideOriginal();
    return;
  }
  const rect = popupOwner.getBoundingClientRect(),
    margin = 12,
    gap = 8;
  const above = Math.max(0, rect.top - gap - margin),
    below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
  const useAbove = above >= Math.min(300, below),
    available = useAbove ? above : below;
  if (available < 40) {
    hideOriginal();
    return;
  }
  const width = Math.min(420, window.innerWidth - 2 * margin);
  originalPopup.style.width = width + 'px';
  originalPopup.style.maxHeight = Math.min(available, window.innerHeight * 0.6) + 'px';
  originalPopup.style.left =
    Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)) + 'px';
  const height = Math.min(available, originalPopup.getBoundingClientRect().height);
  originalPopup.style.top = (useAbove ? rect.top - height - gap : rect.bottom + gap) + 'px';
}
function showOriginal(anchor: HTMLButtonElement, text: string) {
  keepOriginal();
  if (popupOwner === anchor) {
    positionOriginal();
    return;
  }
  hideOriginal();
  if (!originalPopup?.isConnected) {
    originalPopup = element('div', 'wisp-original-popup');
    originalPopup.setAttribute('popover', 'manual');
    originalPopup.setAttribute('role', 'note');
    originalPopup.tabIndex = 0;
    originalPopup.addEventListener('mouseenter', keepOriginal);
    originalPopup.addEventListener('mouseleave', deferHide);
    originalPopup.addEventListener('focusin', keepOriginal);
    originalPopup.addEventListener('focusout', deferHide);
    document.body.append(originalPopup);
  }
  const heading = element('small', '', 'Original message'),
    body = element('div', '');
  linkedText(body, text);
  body.dir = 'auto';
  originalPopup.replaceChildren(heading, body);
  originalPopup.hidden = false;
  if (originalPopup.showPopover) originalPopup.showPopover();
  popupOwner = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  positionOriginal();
}
function restoreSource(message: Message) {
  message.element.classList.remove('wisp-translation-first');
  for (const source of message.sourceElements || []) source.classList.remove('wisp-original-text');
}
export function reading(message: Message, text: string | null, options: ReadingOptions = {}) {
  install();
  restoreSource(message);
  message.element.querySelector<HTMLElement>('.wisp-inline')?.remove();
  if (!text || text.trim() === message.text.trim()) return;
  const line = element(
    'div',
    `wisp-inline${options.error ? ' wisp-error' : ''}${options.loading ? ' wisp-loading' : ''}`,
  );
  const caption = element('div', 'wisp-inline-caption');
  caption.append(
    element(
      'small',
      '',
      options.error
        ? 'Translation unavailable'
        : options.loading
          ? 'Translating…'
          : options.readingLabel || 'English',
    ),
  );
  if (!options.error && !options.loading) {
    const original = button(
      'Original',
      () => {
        if (popupOwner === original && popupPinned) hideOriginal();
        else {
          showOriginal(original, message.text);
          popupPinned = true;
        }
      },
      'wisp-original-button',
    );
    original.setAttribute('aria-label', 'Show original message');
    original.setAttribute('aria-expanded', 'false');
    original.addEventListener('mouseenter', () => {
      if (options.hoverOriginal !== false && !popupPinned) showOriginal(original, message.text);
    });
    original.addEventListener('mouseleave', deferHide);
    original.addEventListener('focus', () => {
      if (!popupPinned) showOriginal(original, message.text);
    });
    original.addEventListener('blur', deferHide);
    original.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideOriginal();
    });
    caption.append(original);
    if (options.readingView !== 'both_languages') {
      message.element.classList.add('wisp-translation-first');
      for (const source of message.sourceElements || []) source.classList.add('wisp-original-text');
    }
  }
  const body = element('div', 'wisp-translation-text', text);
  if (!options.error && !options.loading) linkedText(body, text);
  body.dir = 'auto';
  line.append(caption, body);
  if (options.retry) line.append(button('Try again', options.retry));
  message.element.append(line);
}
export function clearMessage(message: Message) {
  restoreSource(message);
  message.element.querySelector<HTMLElement>('.wisp-inline')?.remove();
  if (!originalPopup || !popupOwner?.isConnected) hideOriginal();
}
document.addEventListener(
  'pointerdown',
  (event) => {
    if (
      popupOwner &&
      !popupOwner.contains(event.target instanceof Node ? event.target : null) &&
      !originalPopup?.contains(event.target instanceof Node ? event.target : null)
    )
      hideOriginal();
  },
  true,
);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideOriginal();
});
window.addEventListener('resize', () => {
  if (popupOwner) positionOriginal();
});
document.addEventListener(
  'scroll',
  (event) => {
    if (popupOwner && !originalPopup?.contains(event.target instanceof Node ? event.target : null))
      positionOriginal();
  },
  true,
);
export function removeReading() {
  hideOriginal();
  document
    .querySelectorAll<HTMLElement>('.wisp-inline, .wisp-original-popup')
    .forEach((node) => node.remove());
  document
    .querySelectorAll<HTMLElement>('.wisp-original-text')
    .forEach((node) => node.classList.remove('wisp-original-text'));
  document
    .querySelectorAll<HTMLElement>('.wisp-translation-first')
    .forEach((node) => node.classList.remove('wisp-translation-first'));
  originalPopup = null;
}
export function remove() {
  removeReading();
  document.querySelectorAll<HTMLElement>('[data-wisp="ui"]').forEach((node) => node.remove());
}
