import { WhatsApp } from '../whatsapp';
import { voice, type VoiceState } from '../ui/voice';
import { decodeVoice, pcmChunk } from './audio';
import type { NativeEvent, ReadingSession, Submit, VoiceNote } from '../contracts';

interface Pending {
  id: string;
  conversation: string;
  view: string;
  controller: AbortController;
  timer: number;
  retranscribe: boolean;
  waiter?: {
    index: number;
    resolve: (value: 'audio' | 'cached') => void;
    reject: (error: Error) => void;
    timer: number;
  };
}
interface Item {
  note: VoiceNote;
  ui: ReturnType<typeof voice>;
  state: VoiceState;
  pending: Pending | null;
  setup: boolean;
  busyRetries: number;
  queued?: { retranscribe: boolean };
  hydration?: { id: string; conversation: string; view: string; timer: number };
}
export function createVoices(services: {
  submit: Submit;
  session: () => ReadingSession;
  isCurrentView: () => boolean;
}) {
  const items = new Map<string, Item>();
  const attempted = new Set<string>();
  let availableAt = 0;
  let pumpTimer: number | undefined;
  function markAttempt(item: Item) {
    attempted.add(item.note.id);
    if (attempted.size > 256) attempted.delete(attempted.values().next().value!);
  }
  function pump() {
    const session = services.session();
    if (
      !session.enabled ||
      !session.config?.can_translate ||
      !services.isCurrentView() ||
      [...items.values()].some((item) => item.pending)
    )
      return;
    if (Date.now() < availableAt) {
      window.clearTimeout(pumpTimer);
      pumpTimer = window.setTimeout(pump, availableAt - Date.now());
      return;
    }
    const manual = [...items.values()].find((item) => item.queued && !item.setup);
    if (manual?.queued) {
      const queued = manual.queued;
      manual.queued = undefined;
      void start(manual, queued.retranscribe);
      return;
    }
    if (!session.config.voice_enabled || session.config.voice_auto === false) return;
    const next = [...items.values()].find(
      (item) =>
        item.note.direction === 'incoming' &&
        !item.hydration &&
        !item.setup &&
        !item.state.translation &&
        !item.state.error &&
        !attempted.has(item.note.id) &&
        (session.config?.speech?.ready || !!item.state.transcript) &&
        WhatsApp.voiceVisible(item.note),
    );
    if (next) {
      markAttempt(next);
      void start(next);
    }
  }
  function enqueue(item: Item, retranscribe = false) {
    if (!services.session().config?.can_translate || !services.isCurrentView()) return;
    cancel(item);
    markAttempt(item);
    item.busyRetries = 0;
    item.queued = { retranscribe };
    item.state.phase = 'queued';
    render(item);
    pump();
  }
  function render(item: Item) {
    item.ui.update(item.state, services.session().config);
  }
  function current(request: Pick<Pending, 'conversation' | 'view'>) {
    const session = services.session();
    return (
      session.enabled &&
      session.active.conversation === request.conversation &&
      session.active.viewId === request.view &&
      services.isCurrentView()
    );
  }
  function cancelHydration(item: Item) {
    if (item.hydration) window.clearTimeout(item.hydration.timer);
    item.hydration = undefined;
  }
  function restore(item: Item) {
    const session = services.session();
    const hydration = {
      id: crypto.randomUUID(),
      conversation: session.active.conversation,
      view: session.active.viewId,
      timer: 0,
    };
    item.hydration = hydration;
    hydration.timer = window.setTimeout(() => {
      if (item.hydration === hydration) {
        item.hydration = undefined;
        pump();
      }
    }, 5000);
    services.submit({
      type: 'saved_voice',
      request_id: hydration.id,
      conversation: hydration.conversation,
      view_id: hydration.view,
      message_id: item.note.id,
      direction: item.note.direction,
      language: null,
      context: WhatsApp.voiceContext(session.active.main, item.note),
    });
  }
  function cancel(item: Item) {
    cancelHydration(item);
    const request = item.pending;
    if (request) {
      availableAt = Date.now() + 500;
      item.pending = null;
      window.clearTimeout(request.timer);
      request.controller.abort();
      if (request.waiter) {
        window.clearTimeout(request.waiter.timer);
        request.waiter.reject(new DOMException('Cancelled', 'AbortError'));
        request.waiter = undefined;
      }
      services.submit({
        type: 'voice_cancel',
        request_id: request.id,
        conversation: request.conversation,
        view_id: request.view,
      });
    }
    item.setup = false;
    item.queued = undefined;
    item.state.phase = item.state.translation ? 'ready' : 'idle';
    render(item);
  }
  function error(item: Item, message: string) {
    cancel(item);
    item.state.error = message;
    item.state.phase = 'error';
    render(item);
    pump();
  }
  function exchange(request: Pending, index: number, payload: Parameters<Submit>[0]) {
    return new Promise<'audio' | 'cached'>((resolve, reject) => {
      request.waiter = {
        index,
        resolve,
        reject,
        timer: window.setTimeout(() => {
          request.waiter = undefined;
          reject(new Error('Voice-note transfer timed out. Try again.'));
        }, 20000),
      };
      services.submit(payload);
    });
  }
  async function start(item: Item, retranscribe = false) {
    const session = services.session();
    if (!session.enabled || !session.config?.can_translate || !services.isCurrentView()) return;
    cancelHydration(item);
    if (
      !session.config.voice_enabled ||
      (!session.config.speech?.ready && (retranscribe || !item.state.transcript))
    ) {
      item.setup = true;
      item.queued = { retranscribe };
      item.state.phase = 'setup';
      item.state.error = '';
      services.submit({
        type: 'speech_download',
        conversation: session.active.conversation,
        view_id: session.active.viewId,
      });
      render(item);
      return;
    }
    if (item.pending) cancel(item);
    item.state.error = '';
    item.state.phase = 'loading';
    const request: Pending = {
      id: crypto.randomUUID(),
      conversation: session.active.conversation,
      view: session.active.viewId,
      controller: new AbortController(),
      timer: 0,
      retranscribe,
    };
    item.pending = request;
    request.timer = window.setTimeout(
      () => error(item, 'Voice-note translation timed out. Try again.'),
      900000,
    );
    render(item);
    try {
      const mode = await exchange(request, -1, {
        type: 'voice_begin',
        retranscribe,
        request_id: request.id,
        conversation: request.conversation,
        view_id: request.view,
        message_id: item.note.id,
        direction: item.note.direction,
        language: item.state.language || null,
        context: WhatsApp.voiceContext(session.active.main, item.note),
      });
      if (mode === 'cached' || !current(request) || item.pending !== request) return;
      const source = await WhatsApp.voiceSource(item.note, request.controller.signal),
        audio = await decodeVoice(
          source,
          request.controller.signal,
          session.config.voice_max_minutes || 10,
        );
      for (let start = 0, index = 0; start < audio.length; start += 8192, index++) {
        request.controller.signal.throwIfAborted();
        if (!current(request) || item.pending !== request) return;
        await exchange(request, index, {
          type: 'voice_audio',
          request_id: request.id,
          conversation: request.conversation,
          view_id: request.view,
          index,
          pcm: pcmChunk(audio, start, Math.min(8192, audio.length - start)),
        });
      }
      if (current(request) && item.pending === request)
        services.submit({
          type: 'voice_finish',
          request_id: request.id,
          conversation: request.conversation,
          view_id: request.view,
        });
    } catch (failure) {
      if (item.pending === request && current(request))
        error(
          item,
          failure instanceof Error ? failure.message : 'Could not transcribe this voice note.',
        );
    }
  }
  function scan(candidates?: readonly HTMLElement[]) {
    const session = services.session();
    if (!session.enabled || !session.active.conversation) {
      clear();
      return;
    }
    const found = WhatsApp.voiceNotes(session.active.main, candidates).filter(
      (note) => session.preferences.include_sent || note.direction === 'incoming',
    );
    const visible = new Set(found.filter(WhatsApp.voiceVisible).map((note) => note.id));
    const notes = [
      ...found.filter((note) => visible.has(note.id) || items.get(note.id)?.pending),
      ...found.filter(
        (note) => !visible.has(note.id) && items.has(note.id) && !items.get(note.id)?.pending,
      ),
    ].slice(0, 64);
    const present = new Set(notes.map((note) => note.id));
    for (const [id, item] of items) {
      if (!present.has(id)) {
        cancel(item);
        item.ui.remove();
        items.delete(id);
      }
    }
    for (const note of notes) {
      let item = items.get(note.id);
      // Restore and build controls when a note enters the viewport. Retain
      // existing rows while scrolling so their translation height stays stable.
      if (!item && !visible.has(note.id)) continue;
      if (item && item.note.element !== note.element) {
        item.ui.remove();
        item.ui = makeUI(note, item);
      }
      if (!item) {
        item = {
          note,
          ui: null as unknown as ReturnType<typeof voice>,
          pending: null,
          setup: false,
          busyRetries: 0,
          state: {
            collapsed: false,
            language: '',
            phase: 'idle',
            transcript: null,
            translation: '',
            error: '',
          },
        };
        item.ui = makeUI(note, item);
        items.set(note.id, item);
        restore(item);
      }
      item.note = note;
      if (!item.ui.element.isConnected) {
        item.ui.remove();
        item.ui = makeUI(note, item);
      }
      if (!session.config?.voice_enabled && item.pending) cancel(item);
      if (item.setup && session.config?.voice_enabled && session.config.speech?.ready) {
        item.setup = false;
      }
      render(item);
    }
    pump();
  }
  function makeUI(note: VoiceNote, item: Item) {
    return voice(note, {
      start: (retranscribe) => enqueue(item, retranscribe),
      collapse: () => {
        item.state.collapsed = !item.state.collapsed;
        render(item);
      },
      cancel: () => {
        cancel(item);
        markAttempt(item);
        pump();
      },
      language: (value) => {
        cancelHydration(item);
        item.state.language = value;
        render(item);
      },
    });
  }
  function accept(event: NativeEvent): boolean {
    if (!('request_id' in event)) return false;
    const restoring = [...items.values()].find((item) => item.hydration?.id === event.request_id);
    if (restoring?.hydration) {
      const hydration = restoring.hydration;
      if (
        event.conversation !== hydration.conversation ||
        !('view_id' in event) ||
        event.view_id !== hydration.view ||
        !current(hydration)
      )
        return true;
      if (event.type === 'voice_saved') {
        cancelHydration(restoring);
        if (!restoring.pending && event.transcript) {
          restoring.state.transcript = event.transcript;
          restoring.state.language = event.language || '';
          restoring.state.translation = event.translation || '';
          restoring.state.phase = event.translation ? 'ready' : 'idle';
          restoring.state.error = '';
          render(restoring);
        }
      } else if (event.type === 'voice_error') {
        cancelHydration(restoring);
        // Do not turn a failed cache read into an automatic audio upload.
        markAttempt(restoring);
      }
      pump();
      return true;
    }
    const item = [...items.values()].find((item) => item.pending?.id === event.request_id);
    if (!item?.pending) return false;
    const request = item.pending;
    if (
      event.conversation !== request.conversation ||
      ('view_id' in event && event.view_id !== request.view) ||
      !current(request)
    )
      return true;
    if (event.type === 'voice_ack') {
      if (request.waiter?.index === event.index) {
        window.clearTimeout(request.waiter.timer);
        request.waiter.resolve('audio');
        request.waiter = undefined;
      }
    } else if (event.type === 'voice_status') {
      item.state.phase = 'transcribing';
    } else if (event.type === 'voice_transcript') {
      if (request.waiter) {
        window.clearTimeout(request.waiter.timer);
        request.waiter.resolve('cached');
        request.waiter = undefined;
      }
      if (item.state.transcript?.text !== event.transcript.text) item.state.translation = '';
      item.state.transcript = event.transcript;
      item.state.phase = 'translating';
      window.clearTimeout(request.timer);
      request.timer = window.setTimeout(
        () => error(item, 'Translation timed out. Try again.'),
        100000,
      );
    } else if (event.type === 'translation') {
      window.clearTimeout(request.timer);
      item.pending = null;
      item.state.translation = event.text;
      item.state.phase = 'ready';
    } else if (event.type === 'voice_error' || event.type === 'translation_error') {
      if (
        event.message.startsWith('Another voice note is being transcribed') &&
        item.busyRetries++ < 40
      ) {
        cancel(item);
        item.queued = { retranscribe: request.retranscribe };
        item.state.phase = 'queued';
        availableAt = Date.now() + 750;
      } else error(item, event.message);
    } else return false;
    render(item);
    pump();
    return true;
  }
  function clear() {
    for (const item of items.values()) {
      cancelHydration(item);
      cancel(item);
      item.ui.remove();
    }
    items.clear();
    attempted.clear();
    window.clearTimeout(pumpTimer);
    pumpTimer = undefined;
  }
  return { scan, accept, clear };
}
