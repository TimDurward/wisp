import { WhatsApp } from '../whatsapp';
import { UI } from '../ui';
import type {
  Message,
  ContextLine,
  Direction,
  ReadingSession,
  SavedMessages,
  TranslationEvent,
  Submit,
} from '../contracts';
interface QueuedReading {
  message: Message;
  text: string;
  direction: Direction;
  context: ContextLine[];
  generation: number;
}
interface PendingReading extends QueuedReading {
  conversation: string;
  timeout?: number;
}
interface Hydration {
  items: QueuedReading[];
  generation: number;
  conversation: string;
  viewId: string;
  timeout?: number;
}
interface ReadingResult {
  source: string;
  text?: string | null;
  error?: string | null;
}
interface ReadingServices {
  session: () => ReadingSession;
  submit: Submit;
  isCurrentView: () => boolean;
  schedule: () => void;
}
export function createReadingQueue(services: ReadingServices) {
  const submit = services.submit;
  let generation = 0;
  const pending = new Map<string, PendingReading>(),
    hydrations = new Map<string, Hydration>();
  const processed = new Map<string, string>(),
    results = new Map<string, ReadingResult>();
  const queue: QueuedReading[] = [];
  const MAX_QUEUED = 64,
    MAX_REMEMBERED = 512;
  function cancelReading(id: string, item: PendingReading) {
    window.clearTimeout(item.timeout);
    submit({ type: 'cancel_translation', request_id: id, conversation: item.conversation });
    pending.delete(id);
    processed.delete(item.message.id);
    if (item.message.element.isConnected && !results.has(item.message.id))
      UI.clearMessage(item.message);
  }

  function cancelWork() {
    generation++;
    queue.length = 0;
    for (const [id, item] of pending) cancelReading(id, item);
    for (const batch of hydrations.values()) {
      window.clearTimeout(batch.timeout);
      for (const item of batch.items) processed.delete(item.message.id);
    }
    hydrations.clear();
    for (const [id, source] of processed)
      if (results.get(id)?.source !== source) processed.delete(id);
  }

  function clearReading() {
    cancelWork();
    processed.clear();
    results.clear();
    UI.removeReading();
  }

  function renderResult(message: Message, result: ReadingResult) {
    const { config, preferences } = services.session();
    UI.reading(
      message,
      result.error || result.text || null,
      result.error
        ? {
            error: true,
            retry: () => {
              results.delete(message.id);
              processed.delete(message.id);
              services.schedule();
            },
          }
        : {
            readingView: preferences.reading_view,
            readingLabel: config?.reading_label || 'English',
            hoverOriginal: preferences.original_on_hover,
          },
    );
  }

  function rememberResult(id: string, result: ReadingResult) {
    results.set(id, result);
    while (results.size > MAX_REMEMBERED) {
      const oldest = results.keys().next().value!;
      const source = results.get(oldest)!.source;
      results.delete(oldest);
      // Completion order can differ from probe order. A forgotten result must
      // be eligible for local restoration when its row is rendered again.
      if (processed.get(oldest) === source) processed.delete(oldest);
    }
  }

  function hydrate(value: SavedMessages) {
    const { active, enabled, config, preferences } = services.session();
    const batch = hydrations.get(value.request_id);
    if (!batch || value.conversation !== batch.conversation || value.view_id !== batch.viewId)
      return;
    hydrations.delete(value.request_id);
    window.clearTimeout(batch.timeout);
    if (!enabled || batch.generation !== generation || !services.isCurrentView()) return;
    const saved = new Map(value.items.map((item) => [item.message_id, item.text]));
    const messages = WhatsApp.messages(active.main);
    for (const item of batch.items) {
      const current = messages.find(
        (message) => message.id === item.message.id && message.text === item.text,
      );
      if (!current || (!preferences.include_sent && item.direction === 'outgoing')) {
        processed.delete(item.message.id);
        continue;
      }
      item.message = current;
      if (saved.has(current.id)) {
        const result = { source: item.text, text: saved.get(current.id) };
        rememberResult(current.id, result);
        renderResult(current, result);
      } else if (config?.can_translate) queue.push(item);
    }
    pump();
    services.schedule();
  }

  function pump() {
    const { active, enabled, config, preferences } = services.session();
    while (enabled && config?.can_translate && pending.size < 1 && queue.length) {
      const item = queue.shift()!;
      if (item.generation !== generation) continue;
      if (
        !item.message.element.isConnected ||
        !WhatsApp.visible(item.message) ||
        (!preferences.include_sent && item.direction === 'outgoing')
      ) {
        processed.delete(item.message.id);
        continue;
      }
      if (!services.isCurrentView()) {
        processed.delete(item.message.id);
        return;
      }
      const id = crypto.randomUUID(),
        conversation = active.conversation;
      const request: PendingReading = { ...item, conversation };
      pending.set(id, request);
      UI.reading(item.message, 'Translating…', { loading: true });
      request.timeout = window.setTimeout(() => {
        submit({ type: 'cancel_translation', request_id: id, conversation });
        finish(id, null, 'Translation timed out. Try again.');
      }, 100000);
      submit({
        type: 'translate',
        request_id: id,
        conversation,
        message_id: item.message.id,
        direction: item.direction,
        purpose: 'reading',
        text: item.text,
        context: item.context,
      });
    }
  }

  function finish(id: string, text: string | null, error: string | null) {
    const { active, enabled, preferences } = services.session();
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    window.clearTimeout(item.timeout);
    if (
      !enabled ||
      item.generation !== generation ||
      item.conversation !== active.conversation ||
      !services.isCurrentView() ||
      (!preferences.include_sent && item.direction === 'outgoing')
    ) {
      processed.delete(item.message.id);
      if (item.message.element.isConnected) UI.clearMessage(item.message);
      pump();
      return;
    }
    const result = { source: item.text, text, error };
    rememberResult(item.message.id, result);
    const current = WhatsApp.messages(active.main).find((m) => m.id === item.message.id);
    if (current && current.text === item.text) renderResult(current, result);
    pump();
  }

  function scan() {
    const { active, enabled, preferences } = services.session();
    if (!enabled || !active.conversation) return;
    const probes: QueuedReading[] = [];
    let probeBytes = 0;
    const items = WhatsApp.messages(active.main);
    for (const message of items
      .filter(
        (m) => (preferences.include_sent || m.direction === 'incoming') && WhatsApp.visible(m),
      )
      .slice(-64)) {
      const completed = results.get(message.id);
      if (completed?.source === message.text) {
        if (!message.element.querySelector('.wisp-inline')) renderResult(message, completed);
        continue;
      }
      if (processed.get(message.id) === message.text) continue;
      if (hydrations.size || probes.length >= 16 || queue.length + probes.length >= MAX_QUEUED)
        break;
      const bytes = WhatsApp.byteLength(JSON.stringify(message.text)) + 300;
      if (probeBytes + bytes > 50000) break;
      probeBytes += bytes;
      processed.set(message.id, message.text);
      while (processed.size > MAX_REMEMBERED) processed.delete(processed.keys().next().value!);
      probes.push({
        message,
        text: message.text,
        direction: message.direction,
        context: WhatsApp.context(items, message.id),
        generation,
      });
    }
    if (probes.length) {
      const id = crypto.randomUUID();
      const batch: Hydration = {
        items: probes,
        generation,
        conversation: active.conversation,
        viewId: active.viewId,
      };
      hydrations.set(id, batch);
      batch.timeout = window.setTimeout(
        () =>
          hydrate({
            type: 'saved_messages',
            request_id: id,
            conversation: batch.conversation,
            view_id: batch.viewId,
            items: [],
          }),
        10000,
      );
      submit({
        type: 'saved_messages',
        request_id: id,
        conversation: batch.conversation,
        view_id: batch.viewId,
        messages: probes.map((item) => ({
          message_id: item.message.id,
          direction: item.direction,
          text: item.text,
        })),
      });
    }
    pump();
  }

  function hideSent() {
    const { active } = services.session();
    for (const [id, item] of pending) if (item.direction === 'outgoing') cancelReading(id, item);
    for (let i = queue.length - 1; i >= 0; i--)
      if (queue[i]!.direction === 'outgoing') {
        processed.delete(queue[i]!.message.id);
        queue.splice(i, 1);
      }
    for (const message of WhatsApp.messages(active.main))
      if (message.direction === 'outgoing') UI.clearMessage(message);
  }
  function accept(event: TranslationEvent) {
    if (event.type === 'translation') finish(event.request_id, event.text, null);
    else if (event.type === 'translation_error') finish(event.request_id, null, event.message);
  }
  return { scan, hydrate, accept, hideSent, clear: clearReading, cancel: cancelWork };
}
