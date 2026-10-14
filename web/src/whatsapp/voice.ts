import { records, context, messages, messageDirection, visible } from './messages';
import { selectors } from './selectors';
import { findVoicePlay, voiceContainerSelector, viewOnceSelector } from './voice-selectors';
import type { VoiceNote } from '../contracts';

export function voiceNotes(main: HTMLElement | null): VoiceNote[] {
  const notes: VoiceNote[] = [];
  if (!main) return notes;
  for (const container of records(main)) {
    if (container.querySelector(viewOnceSelector)) continue;
    const play = findVoicePlay(container);
    if (!play) continue;
    const id = container.getAttribute('data-id')!,
      bubble = container.matches(`${selectors.incoming}, ${selectors.outgoing}`)
        ? container
        : container.querySelector<HTMLElement>(`${selectors.incoming}, ${selectors.outgoing}`);
    const element = bubble || voiceElement(container, play, main);
    const direction = messageDirection(container, element, main);
    if (!direction) continue;
    notes.push({ id, direction, element, container });
  }
  return notes;
}
export function voiceVisible(note: VoiceNote) {
  return visible({ ...note, text: '', sourceElements: [] });
}
function voiceElement(container: HTMLElement, play: HTMLElement, main: HTMLElement) {
  const named = play.closest<HTMLElement>('[data-pre-plain-text], ' + voiceContainerSelector);
  let element = named && container.contains(named) ? named : container;
  const width = main.getBoundingClientRect().width;
  // Current WhatsApp markup may have a full-width row around a classless bubble.
  // Find the outer aligned body, rather than measuring its tiny play button.
  for (let node = play.parentElement; node && node !== container; node = node.parentElement) {
    const bounds = node.getBoundingClientRect();
    if (bounds.width >= 100 && bounds.width <= width - 16) element = node;
  }
  return element;
}
export function voiceContext(main: HTMLElement | null, note: VoiceNote) {
  const rows = records(main),
    before = rows.indexOf(note.container);
  return context(
    messages(main).filter((message) => {
      const index = rows.indexOf(message.container);
      return index >= 0 && index < before;
    }),
  );
}
function validSource(source: string) {
  try {
    const url = new URL(source);
    return (
      (url.protocol === 'blob:' && url.origin === location.origin) ||
      (url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        (url.origin === location.origin || /(^|\.)whatsapp\.net$/.test(url.hostname)))
    );
  } catch {
    return false;
  }
}
export function voiceSource(note: VoiceNote, signal: AbortSignal): Promise<string> {
  const audio = [...note.container.querySelectorAll<HTMLAudioElement>('audio')].find(
    (node) => !node.closest(selectors.quote + ', [data-wisp]'),
  );
  const direct = audio?.currentSrc || audio?.src;
  if (direct && validSource(direct)) return Promise.resolve(direct);
  const nonce = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        finish(
          new Error('WhatsApp could not load this voice note. Try its player once, then retry.'),
        ),
      15000,
    );
    function finish(value: string | Error) {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', cancel);
      window.postMessage(
        { source: 'wisp-voice-request', action: 'cancel', nonce },
        location.origin,
      );
      if (typeof value === 'string') resolve(value);
      else reject(value);
    }
    function cancel() {
      finish(new DOMException('Cancelled', 'AbortError'));
    }
    function receive(event: MessageEvent) {
      const data = event.data;
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        data?.source !== 'wisp-voice-source' ||
        data.nonce !== nonce ||
        data.message_id !== note.id
      )
        return;
      if (typeof data.url === 'string' && validSource(data.url)) finish(data.url);
      else
        finish(
          new Error('The recording is not available. Load this voice note in WhatsApp and retry.'),
        );
    }
    window.addEventListener('message', receive);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    window.postMessage(
      { source: 'wisp-voice-request', action: 'load', nonce, message_id: note.id },
      location.origin,
    );
  });
}
