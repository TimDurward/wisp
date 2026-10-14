import { element } from './dom';

let closeActive: (() => void) | undefined;

// Body-mounted, with the top layer where available: never clipped by a message row.
export function voicePopover(trigger: HTMLButtonElement, label: string, className: string) {
  const panel = element('div', `wisp-voice-popover ${className}`);
  panel.id = `wisp-voice-${crypto.randomUUID()}`;
  panel.hidden = true;
  panel.setAttribute('popover', 'manual');
  panel.setAttribute('role', 'dialog');
  panel.tabIndex = -1;
  panel.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  document.body.append(panel);
  let listeners: AbortController | undefined;
  function position() {
    const bounds = trigger.getBoundingClientRect(),
      viewport = window.visualViewport,
      left = viewport?.offsetLeft || 0,
      top = viewport?.offsetTop || 0,
      width = viewport?.width || window.innerWidth,
      height = viewport?.height || window.innerHeight;
    panel.style.width = `${Math.max(0, Math.min(360, width - 24))}px`;
    const below = bounds.bottom + 8,
      belowSpace = top + height - 12 - below,
      aboveSpace = bounds.top - top - 20,
      placeBelow = belowSpace >= aboveSpace;
    // Keep the trigger row exposed even for a very long original transcript.
    panel.style.maxHeight = `${Math.max(0, Math.min(height - 24, placeBelow ? belowSpace : aboveSpace))}px`;
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(left + 12, Math.min(bounds.right - size.width, left + width - size.width - 12))}px`;
    panel.style.top = `${Math.max(top + 12, Math.min(placeBelow ? below : bounds.top - size.height - 8, top + height - size.height - 12))}px`;
  }
  function close(focus = false) {
    if (panel.hidden) return;
    listeners?.abort();
    listeners = undefined;
    if (typeof panel.hidePopover === 'function') panel.hidePopover();
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (closeActive === close) closeActive = undefined;
    if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function open() {
    if (trigger.disabled) return;
    closeActive?.();
    panel.hidden = false;
    if (typeof panel.showPopover === 'function') panel.showPopover();
    position();
    trigger.setAttribute('aria-expanded', 'true');
    closeActive = close;
    listeners = new AbortController();
    const signal = listeners.signal;
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node))
          close();
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      },
      { capture: true, signal },
    );
    window.addEventListener('resize', position, { signal });
    window.visualViewport?.addEventListener('resize', position, { signal });
    document.addEventListener(
      'scroll',
      (event) => {
        if (!panel.contains(event.target as Node)) close();
      },
      { capture: true, passive: true, signal },
    );
    (panel.querySelector<HTMLElement>('button, select') || panel).focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => (panel.hidden ? open() : close(true)));
  panel.addEventListener('click', (event) => event.stopPropagation());
  return {
    panel,
    close,
    remove() {
      close();
      panel.remove();
    },
  };
}
