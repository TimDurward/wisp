import { records, context, messages, messageDirection, visible } from './messages';
import { selectors } from './selectors';
import {
  findVoicePlay,
  voiceContainerSelector,
  viewOnceSelector,
  voicePlaySelector,
  voiceMarkerSelector,
} from './voice-selectors';
import type { VoiceNote } from '../contracts';
const candidateSelector = voicePlaySelector + ', ' + voiceMarkerSelector;

export function voiceNotes(
  main: HTMLElement | null,
  candidates?: readonly HTMLElement[],
): VoiceNote[] {
  const notes: VoiceNote[] = [];
  if (!main) return notes;
  // Most rows are text. Query audio markers once instead of allocating several
  // empty NodeLists for each text message on every scroll scan.
  const markers = main.querySelectorAll(candidateSelector);
  if (!markers.length) return notes;
  const rows = candidates || records(main);
  const valid = new Set(rows);
  const possible = new Set<HTMLElement>();
  for (const marker of markers) {
    if (marker.closest(selectors.quote + ', [data-wisp]')) continue;
    for (
      let row = marker.closest<HTMLElement>(selectors.message);
      row && main.contains(row);
      row = row.parentElement?.closest<HTMLElement>(selectors.message) || null
    )
      if (valid.has(row)) possible.add(row);
  }
  for (const container of rows) {
    if (!possible.has(container)) continue;
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
  return visible(note);
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
  if (before < 0) return [];
  // A voice row may contain no selectable text. Use it as the anchor and read
  // only its preceding text context, rather than decoding the entire history.
  return context(
    messages(main, new Set([note.id]), 8, rows.slice(0, before + 1)).filter(
      (message) => message.container !== note.container,
    ),
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
