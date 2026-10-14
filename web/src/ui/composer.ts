import { install, element, button } from './dom';
import { positionOriginal } from './reading';
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
  const nativeStyle = getComputedStyle(slot.panel);
  const nativeTop = parseFloat(nativeStyle.paddingTop) || 0;
  const nativeHeight = slot.panel.getBoundingClientRect().height;
  let reserved = -1,
    frame: number | undefined;
  function place() {
    frame = undefined;
    if (!panel.isConnected || !slot.input.isConnected) return;
    if (panel.hidden) {
      slot.panel.classList.remove('wisp-compose-shell');
      reserved = -1;
      return;
    }
    const host = slot.panel.getBoundingClientRect(),
      input = slot.input.getBoundingClientRect();
    const left = Math.max(host.left + 12, input.left - 12),
      right = Math.min(host.right - 12, input.right + 12);
    panel.style.left = left + 'px';
    panel.style.width = Math.max(0, right - left) + 'px';
    panel.style.top = host.top + nativeTop + 8 + 'px';
    panel.style.color = getComputedStyle(slot.input).color;
    const height = Math.ceil(panel.getBoundingClientRect().height) + 16;
    if (height !== reserved) {
      reserved = height;
      slot.panel.style.setProperty('--wisp-native-top', nativeTop + 'px');
      slot.panel.style.setProperty('--wisp-native-height', nativeHeight + 'px');
      slot.panel.style.setProperty('--wisp-preview-space', height + 'px');
      slot.panel.classList.add('wisp-compose-shell');
      relocate();
    }
    positionOriginal();
  }
  function relocate() {
    if (!frame) frame = requestAnimationFrame(place);
  }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(relocate);
  for (const node of [slot.input, slot.panel, panel]) resize?.observe(node);
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
      panel.hidden = !state.source;
      translation.hidden = prepared || !state.text;
      preview.textContent = state.text || '';
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
      window.removeEventListener('resize', relocate);
      window.removeEventListener('wisp-layout', relocate);
      document.removeEventListener('scroll', relocate, true);
      slot.panel.classList.remove('wisp-compose-shell');
      for (const name of ['--wisp-native-top', '--wisp-native-height', '--wisp-preview-space'])
        slot.panel.style.removeProperty(name);
      panel.remove();
    },
  };
}
