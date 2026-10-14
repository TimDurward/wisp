import type { ComposerSlot } from '../contracts';
import { selectors } from './selectors';
import { records } from './messages';
import { textOf } from './text';
const sendSelector =
  '[data-testid="compose-btn-send"], [data-icon="send"], [data-icon="wds-ic-send-filled"], [data-icon="wds-ic-send-fill"], button[aria-label="Send"], [role="button"][aria-label="Send"]';
const composerActionSelector =
  sendSelector +
  ', [data-icon="ptt"], [data-icon="wds-ic-mic-filled"], [data-icon="plus"], [data-testid="attach-menu-plus"]';
const mediaSelector =
  '[data-testid="media-editor"], [data-testid="media-preview"], [data-testid="media-modal"], [data-testid="media-caption-input-container"]';
export function usableEditor(node: HTMLElement | null) {
  if (!node?.isConnected) return false;
  if (node.closest('header, [data-wisp], [aria-hidden="true"]')) return false;
  for (
    let parent: HTMLElement | null = node;
    parent && parent !== node.ownerDocument.body;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function attachmentComposer(
  main: HTMLElement | null,
): { present: boolean; slot: ComposerSlot | null } | null {
  if (!main?.isConnected) return null;
  const scopes = [
    ...document.querySelectorAll<HTMLElement>(
      mediaSelector + ', [role="dialog"][aria-modal="true"]',
    ),
  ];
  const candidates = new Map<HTMLElement, ComposerSlot>();
  let present = false;
  for (let scope of scopes) {
    if (!usableEditor(scope)) continue;
    const known = scope.matches(mediaSelector);
    if (!known && !scope.querySelector<HTMLElement>('img, canvas, video')) continue;
    if (known) present = true;
    // Caption containers may live in a portal with the send action beside
    // them. Ascend only through media wrappers without chat message records.
    if (known && !scope.querySelector<HTMLElement>(sendSelector)) {
      while (
        scope.parentElement &&
        scope.parentElement !== document.body &&
        !scope.querySelector<HTMLElement>(sendSelector)
      ) {
        if (
          scope.parentElement.querySelector<HTMLElement>(selectors.message) ||
          scope.parentElement.querySelector<HTMLElement>('header')
        )
          break;
        scope = scope.parentElement;
      }
    }
    if (!scope.querySelector<HTMLElement>(sendSelector)) continue;
    present = true;
    const editors = [...scope.querySelectorAll<HTMLElement>(selectors.composer)].filter(
      usableEditor,
    );
    if (editors.length !== 1) continue;
    const input = editors[0]!,
      panel =
        input.closest<HTMLElement>('[data-testid="media-caption-input-container"]') ||
        input.parentElement;
    if (
      !panel ||
      panel === scope ||
      (main.contains(panel) && panel.querySelector<HTMLElement>(selectors.message))
    )
      continue;
    candidates.set(input, { input, panel, boundary: scope, sendRoot: scope, kind: 'attachment' });
  }
  return { present, slot: candidates.size === 1 ? [...candidates.values()][0]! : null };
}

export function composer(
  main: HTMLElement | null = document.querySelector<HTMLElement>(selectors.main),
): ComposerSlot | null {
  if (!main?.isConnected) return null;
  const media = attachmentComposer(main);
  if (media?.slot) return media.slot;
  // Ambiguous media editors must not fall through to the background textbox.
  if (media?.present) return null;
  const candidates = main
    ? [...main.querySelectorAll<HTMLElement>(selectors.composer)].filter(usableEditor)
    : [];
  if (candidates.length !== 1) return null;
  const input = candidates[0]!;
  // Pick the smallest composer shell with native actions. Never anchor to an
  // outer full-height wrapper merely because its message list is elsewhere.
  let panel = input.parentElement;
  for (let node = panel; node && node !== main; node = node.parentElement) {
    if (node.querySelector<HTMLElement>('header') || records(node).length) break;
    if (
      node.matches('footer, [data-testid="conversation-compose-box"]') ||
      node.querySelector<HTMLElement>(composerActionSelector)
    ) {
      panel = node;
      break;
    }
  }
  return panel && panel !== main ? { input, panel, boundary: main } : null;
}

export function draft(
  main: HTMLElement | null = document.querySelector<HTMLElement>(selectors.main),
) {
  return textOf(composer(main)?.input ?? null);
}

export function focusDraft(main: HTMLElement | null, expectedSource: string) {
  const slot = composer(main);
  if (!slot?.input.isConnected || draft(main) !== expectedSource) return false;
  slot.input.focus();
  return document.activeElement === slot.input;
}

export function selectedDraft(main: HTMLElement | null, expectedSource: string) {
  const slot = composer(main),
    selection = window.getSelection();
  if (
    !slot ||
    document.activeElement !== slot.input ||
    draft(main) !== expectedSource ||
    selection?.rangeCount !== 1
  )
    return false;
  const range = selection.getRangeAt(0);
  return (
    slot.input.contains(range.startContainer) &&
    slot.input.contains(range.endContainer) &&
    textOf(range.cloneContents()) === expectedSource
  );
}

export function sendAction(target: Element | null, main: HTMLElement | null) {
  const action = target?.closest('button, [role="button"]'),
    slot = composer(main);
  return (
    !!action &&
    !!(slot?.sendRoot || slot?.panel)?.contains(action) &&
    (action.matches(sendSelector) || !!action.querySelector<HTMLElement>(sendSelector))
  );
}
