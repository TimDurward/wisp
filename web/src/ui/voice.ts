import { install, element, button } from './dom';
import { linkedText } from './links';
import { voicePopover } from './voice-popover';
import { icon } from './icons';
import { onAppearanceChange, opaqueColor } from './appearance';
import { findVoicePlay } from '../whatsapp/voice-selectors';
import type { Config, VoiceNote, VoiceTranscript } from '../contracts';

export interface VoiceState {
  language: string;
  collapsed: boolean;
  phase:
    'idle' | 'setup' | 'queued' | 'loading' | 'transcribing' | 'translating' | 'ready' | 'error';
  transcript: VoiceTranscript | null;
  translation: string;
  error: string;
}
export function voice(
  note: VoiceNote,
  actions: {
    start: (retranscribe?: boolean) => void;
    cancel: () => void;
    collapse: () => void;
    language: (value: string) => void;
  },
) {
  install();
  const panel = element('section', 'wisp-voice');
  panel.setAttribute('aria-label', 'Voice-note translation');
  const content = element('div', 'wisp-voice-content'),
    caption = element('div', 'wisp-voice-caption'),
    status = element('span', 'wisp-voice-status'),
    originalButton = button('Original', () => {}, 'wisp-voice-original-button'),
    dots = button('', () => {}, 'wisp-voice-dots'),
    collapse = button('', actions.collapse, 'wisp-voice-collapse');
  dots.append(icon('options'));
  collapse.append(icon('collapse'));
  collapse.setAttribute('aria-label', 'Collapse voice translation');
  status.setAttribute('role', 'status');
  dots.setAttribute('aria-label', 'Voice-note options');
  dots.setAttribute('aria-haspopup', 'dialog');
  originalButton.setAttribute('aria-haspopup', 'dialog');
  const mic = icon('microphone');
  mic.classList.add('wisp-voice-mic');
  caption.append(mic, status, collapse, originalButton, dots);
  const translation = element('div', 'wisp-voice-text wisp-voice-output');
  translation.dir = 'auto';
  const start = button('Translate voice note', () => actions.start(), 'wisp-voice-start');
  const original = voicePopover(originalButton, 'Original transcript', 'wisp-voice-original'),
    heading = element('div', 'wisp-voice-popover-heading', 'Original transcript'),
    source = element('div', 'wisp-voice-source'),
    transcript = element('div', 'wisp-voice-text'),
    review = element(
      'div',
      'wisp-voice-review',
      'Machine transcription may contain errors. Check the audio if something seems unclear.',
    );
  transcript.dir = 'auto';
  original.panel.append(heading, source, transcript, review);
  const options = voicePopover(dots, 'Voice-note options', 'wisp-voice-options'),
    languageLabel = element('label', 'wisp-voice-language', 'Spoken language'),
    language = element('select', 'wisp-voice-select'),
    help = element(
      'div',
      'wisp-voice-help',
      'Auto-detect the spoken language, or choose it and transcribe again.',
    ),
    redo = button(
      'Transcribe again',
      () => {
        options.close(true);
        actions.start(true);
      },
      'wisp-voice-redo',
    ),
    retry = button(
      'Retry translation',
      () => {
        options.close(true);
        actions.start();
      },
      'wisp-voice-retry',
    ),
    cancel = button(
      'Cancel translation',
      () => {
        options.close(true);
        actions.cancel();
      },
      'wisp-voice-cancel',
    ),
    copy = button(
      'Copy translation',
      () => {
        if (translation.textContent)
          void navigator.clipboard
            .writeText(translation.textContent)
            .then(() => options.close(true))
            .catch(() => {
              help.textContent = 'Could not copy. Select the translation to copy it.';
            });
      },
      'wisp-voice-copy',
    );
  language.setAttribute('aria-label', 'Voice-note source language');
  language.addEventListener('change', () => actions.language(language.value));
  languageLabel.append(language);
  options.panel.append(languageLabel, help, redo, retry, copy, cancel);
  content.append(caption, translation, start);
  panel.append(content);
  panel.addEventListener('click', (event) => event.stopPropagation());
  const layout = getComputedStyle(note.element),
    wrap =
      ['flex', 'inline-flex'].includes(layout.display) && layout.flexDirection.startsWith('row'),
    addedWrap = wrap && !note.element.classList.contains('wisp-voice-flex-host');
  if (addedWrap) note.element.classList.add('wisp-voice-flex-host');
  for (const edge of ['paddingLeft', 'paddingRight', 'paddingBottom'] as const) {
    content.style[edge] = `${Math.max(0, 14 - (parseFloat(layout[edge]) || 0))}px`;
  }
  const previousSurface = note.element.style.getPropertyValue('--wisp-voice-native-surface'),
    previousRadius = note.element.style.getPropertyValue('--wisp-voice-native-radius'),
    addedHost = !note.element.classList.contains('wisp-voice-host');
  function syncAppearance() {
    // Remove our paint while sampling so a changed native theme cannot read the old snapshot.
    note.element.classList.remove('wisp-voice-host');
    const native = getComputedStyle(note.element);
    let surface = '',
      radius = native.borderRadius;
    for (let node = findVoicePlay(note.container)?.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (opaqueColor(style.backgroundColor)) {
        surface = style.backgroundColor;
        radius = style.borderRadius;
      }
      if (node === note.element) break;
    }
    const fallback =
      note.direction === 'incoming' ? '--incoming-background' : '--outgoing-background';
    note.element.style.setProperty(
      '--wisp-voice-native-surface',
      surface || `var(${fallback}, var(--background-default, Canvas))`,
    );
    note.element.style.setProperty(
      '--wisp-voice-native-radius',
      radius && radius !== '0px' ? radius : '8px',
    );
    note.element.classList.add('wisp-voice-host');
    for (const popup of [original.panel, options.panel]) {
      popup.style.backgroundColor = surface;
      popup.style.color = native.color;
    }
  }
  syncAppearance();
  const stopAppearance = onAppearanceChange(syncAppearance);
  note.element.append(panel);
  let catalog = '';
  return {
    element: panel,
    remove() {
      stopAppearance();
      original.remove();
      options.remove();
      panel.remove();
      if (addedWrap) note.element.classList.remove('wisp-voice-flex-host');
      if (addedHost) note.element.classList.remove('wisp-voice-host');
      for (const [key, value] of [
        ['--wisp-voice-native-surface', previousSurface],
        ['--wisp-voice-native-radius', previousRadius],
      ]) {
        if (value) note.element.style.setProperty(key!, value);
        else note.element.style.removeProperty(key!);
      }
    },
    update(state: VoiceState, config: Config | null) {
      const languages = config?.voice_languages || [],
        signature = JSON.stringify(languages);
      if (signature !== catalog) {
        catalog = signature;
        const automatic = document.createElement('option');
        automatic.value = '';
        automatic.textContent = 'Auto-detect';
        language.replaceChildren(automatic);
        for (const item of languages) {
          const option = document.createElement('option');
          option.value = item.code;
          option.textContent = item.label + (item.supported ? '' : ' · Voice unavailable');
          option.disabled = !item.supported;
          language.append(option);
        }
      }
      language.value = state.language;
      const model = config?.speech,
        enabled = !!config?.voice_enabled,
        busy = ['loading', 'transcribing', 'translating', 'queued'].includes(state.phase),
        automatic = enabled && config?.voice_auto !== false && note.direction === 'incoming',
        detected =
          languages.find((item) => item.code === state.transcript?.language)?.label ||
          state.transcript?.language;
      const progress: Partial<Record<VoiceState['phase'], string>> = {
        transcribing: 'Transcribing…',
        translating: 'Translating…',
        loading: 'Loading recording…',
        queued: 'Waiting to transcribe…',
      };
      status.textContent =
        state.error ||
        (!model?.ready && enabled ? model?.error : '') ||
        progress[state.phase] ||
        (state.translation
          ? `${config?.reading_label || 'English'} · Transcribed`
          : model?.downloading
            ? `Setting up… ${model.progress}%`
            : 'Voice note');
      status.classList.toggle('wisp-voice-error', !!state.error);
      start.hidden =
        busy ||
        !!state.translation ||
        !!model?.downloading ||
        (automatic && !!model?.ready && !state.error);
      start.disabled = !config?.can_translate;
      start.textContent = !enabled
        ? 'Enable voice translation'
        : !model?.ready && !state.transcript
          ? 'Download speech model'
          : state.error
            ? 'Try again'
            : 'Translate voice note';
      start.title =
        !enabled || !model?.ready
          ? 'Optional · One-time 465 MB download. Audio stays on your device; ChatGPT translates the text.'
          : '';
      originalButton.disabled = !state.transcript;
      collapse.hidden = !state.translation;
      collapse.setAttribute(
        'aria-label',
        state.collapsed ? 'Expand voice translation' : 'Collapse voice translation',
      );
      collapse.setAttribute('aria-expanded', String(!state.collapsed));
      collapse.classList.toggle('wisp-voice-collapsed', state.collapsed);
      translation.hidden = !state.translation || state.collapsed;
      linkedText(translation, state.translation);
      source.textContent = `Machine transcript${detected ? ` · ${detected}` : ''}`;
      linkedText(transcript, state.transcript?.text || '');
      review.hidden = !state.transcript?.review;
      language.disabled = busy;
      redo.disabled = busy || !config?.can_translate;
      redo.textContent = state.transcript ? 'Transcribe again' : 'Transcribe voice note';
      retry.hidden = !state.transcript || !!state.translation;
      retry.disabled = busy || !config?.can_translate;
      copy.hidden = !state.translation;
      cancel.hidden = !busy;
      if (!state.transcript) original.close();
    },
  };
}
