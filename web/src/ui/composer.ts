import { install, element, button } from './dom';
import { positionOriginal } from './reading';
import { linkedText } from './links';
import { onlyLinks } from '../links';
import type { ComposerSlot, ComposerActions, DraftState } from '../contracts';
export function composer(slot: ComposerSlot, actions: ComposerActions) {
  install();
  const panel = element('section', 'wisp-composer');
  panel.setAttribute('aria-label', 'Reply translation preview');
  if (slot.kind === 'attachment') panel.classList.add('wisp-composer-attachment');
  const translation = element('div', 'wisp-draft-translation');
  const label = element('small', 'wisp-draft-language', 'Spanish');
  const preview = element('div', 'wisp-preview-text');
  translation.append(label, preview);
  const bottom = element('div', 'wisp-preview-footer'),
    status = element('span', 'wisp-draft-status');
  status.setAttribute('aria-live', 'polite');
  const controls = element('div', 'wisp-draft-actions');
  const previewButton = button('Translate', actions.preview, 'wisp-preview-button');
  const prepare = button('Use Spanish', actions.prepare, 'wisp-prepare');
  const edit = button('Edit original', actions.edit);
  const copy = button('Copy', actions.copy);
  copy.setAttribute('aria-label', 'Copy Spanish');
  controls.append(previewButton, copy, edit, prepare);
  bottom.append(status, controls);
  panel.append(translation, bottom);
  document.body.append(panel);
  let frame: number | undefined;
  const widths = new Set<HTMLElement>();
  // Every nested flex item between the editor and chat pane must be allowed
  // to shrink. Fixing only the editor still lets an outer wrapper overflow.
  function constrainWidth() {
    const next = new Set<HTMLElement>(),
      boundary = slot.boundary || slot.panel;
    for (
      let node: HTMLElement | null = slot.input;
      node && node !== document.body && node !== document.documentElement;
      node = node.parentElement
    ) {
      next.add(node);
      if (node === boundary) break;
    }
    for (const node of widths) {
      if (next.has(node)) continue;
      node.classList.remove('wisp-compose-width');
      if (node !== slot.input && node !== slot.panel) resize?.unobserve(node);
      widths.delete(node);
    }
    for (const node of next) {
      node.classList.add('wisp-compose-width');
      if (!widths.has(node)) resize?.observe(node);
      widths.add(node);
    }
    slot.input.classList.add('wisp-compose-input');
  }
  function restore() {
    slot.panel.classList.remove('wisp-compose-shell');
    for (const name of ['--wisp-native-top', '--wisp-native-height', '--wisp-preview-space'])
      slot.panel.style.removeProperty(name);
  }
  function place() {
    frame = undefined;
    if (!panel.isConnected || !slot.input.isConnected) return;
    constrainWidth();
    if (panel.hidden) {
      restore();
      return;
    }
    // Measure the current native layout without our reserved space. Link cards,
    // quoted replies and multiline drafts can change its height after binding.
    slot.panel.classList.remove('wisp-compose-shell');
    const nativeStyle = getComputedStyle(slot.panel),
      nativeTop = parseFloat(nativeStyle.paddingTop) || 0,
      nativeHeight = slot.panel.getBoundingClientRect().height,
      host = slot.panel.getBoundingClientRect(),
      input = slot.input.getBoundingClientRect();
    const boundary = slot.boundary?.getBoundingClientRect(),
      pane = boundary?.width ? boundary : host,
      left = Math.max(12, pane.left + 12, host.left + 12, input.left - 12),
      right = Math.min(innerWidth - 12, pane.right - 12, host.right - 12, input.right + 12);
    panel.style.left = left + 'px';
    panel.style.width = Math.max(0, right - left) + 'px';
    panel.style.color = getComputedStyle(slot.input).color;
    const height = Math.ceil(panel.getBoundingClientRect().height) + 16;
    const chrome =
      nativeTop +
      (parseFloat(nativeStyle.paddingBottom) || 0) +
      (parseFloat(nativeStyle.borderTopWidth) || 0) +
      (parseFloat(nativeStyle.borderBottomWidth) || 0);
    const minimum =
      nativeStyle.boxSizing === 'border-box' ? nativeHeight + height : nativeHeight - chrome;
    slot.panel.style.setProperty('--wisp-native-top', nativeTop + 'px');
    slot.panel.style.setProperty('--wisp-native-height', Math.max(0, minimum) + 'px');
    slot.panel.style.setProperty('--wisp-preview-space', height + 'px');
    slot.panel.classList.add('wisp-compose-shell');
    panel.style.top = slot.panel.getBoundingClientRect().top + nativeTop + 8 + 'px';
    positionOriginal();
  }
  function relocate() {
    if (!frame) frame = requestAnimationFrame(place);
  }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(relocate);
  for (const node of [slot.input, slot.panel, panel]) resize?.observe(node);
  const contents = new MutationObserver(relocate);
  contents.observe(slot.panel, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', relocate);
  window.addEventListener('wisp-layout', relocate);
  document.addEventListener('scroll', relocate, true);
  return {
    element: panel,
    preview,
    update(state: DraftState) {
      const target = state.replyLanguageLabel || 'Spanish',
        detail = state.replyLabel || 'Spanish · Peru';
      label.textContent = target;
      panel.setAttribute('aria-label', detail + ' reply preview');
      prepare.textContent = 'Use ' + target;
      copy.setAttribute('aria-label', 'Copy ' + target);
      label.title = detail;
      const prepared = state.mode === 'translated',
        busy = state.phase === 'preparing';
      panel.hidden = !state.source || onlyLinks(state.source);
      translation.hidden = prepared || !state.text;
      if (state.phase === 'ready') linkedText(preview, state.text || '');
      else preview.textContent = state.text || '';
      preview.classList.toggle('wisp-stale', state.phase !== 'ready');
      previewButton.hidden = prepared || (state.livePreview && state.phase !== 'error');
      previewButton.disabled = !state.source || state.phase === 'translating' || busy;
      prepare.hidden = prepared || !state.source;
      prepare.disabled = state.phase !== 'ready';
      prepare.title =
        'Use this ' + detail + ' draft' + (state.hasRules ? ' · Translation rules applied' : '');
      edit.hidden = !prepared || !state.originalSource;
      edit.disabled = busy;
      copy.hidden = prepared || state.phase !== 'ready';
      status.textContent =
        state.error ||
        (busy
          ? 'Updating draft…'
          : prepared
            ? target + ' ready · Enter to send'
            : state.phase === 'ready'
              ? state.enterPrepares
                ? 'Enter to use ' + target
                : 'Use ' + target + ' before sending'
              : state.phase === 'translating'
                ? 'Translating…'
                : state.phase === 'waiting'
                  ? 'Updating ' + target + '…'
                  : 'Preview ' + target + ' before sending');
      panel.classList.toggle('wisp-draft-error', !!state.error);
      relocate();
    },
    remove() {
      cancelAnimationFrame(frame ?? 0);
      resize?.disconnect();
      contents.disconnect();
      window.removeEventListener('resize', relocate);
      window.removeEventListener('wisp-layout', relocate);
      document.removeEventListener('scroll', relocate, true);
      restore();
      for (const node of widths) node.classList.remove('wisp-compose-width');
      widths.clear();
      slot.input.classList.remove('wisp-compose-input');
      panel.remove();
    },
  };
}
