import { WhatsApp } from '../whatsapp';
import { chatPreview } from '../ui/previews';
import type { Config, Direction, Message, ReadingSession } from '../contracts';
import type { SidebarChat } from '../whatsapp/previews';

interface Binding extends SidebarChat {
  conversation: string;
  source?: HTMLElement;
  original?: string;
  text?: string;
  restore?: () => void;
}
interface Result {
  conversation: string;
  original: string;
  text: string;
  direction: Direction;
}

export function createChatPreviews(session: () => ReadingSession) {
  const bindings = new Map<HTMLElement, Binding>();
  const results = new Map<string, Result>();
  let previous: Config | null = null;
  const key = (conversation: string, source: string) =>
    JSON.stringify([conversation, WhatsApp.previewText(source)]);

  function remove(binding: Binding) {
    binding.restore?.();
    bindings.delete(binding.element);
  }
  function clear() {
    for (const binding of bindings.values()) remove(binding);
    results.clear();
  }
  function configure(config: Config) {
    if (
      previous &&
      (previous.history_revision !== config.history_revision ||
        previous.reading_language !== config.reading_language)
    )
      clear();
    previous = config;
    if (!config.view_preferences.include_sent)
      for (const [id, result] of results) if (result.direction === 'outgoing') results.delete(id);
    if (!config.enabled) {
      for (const binding of bindings.values())
        if (binding.conversation === config.conversation) remove(binding);
      for (const [id, result] of results)
        if (result.conversation === config.conversation) results.delete(id);
    }
    for (const binding of bindings.values()) render(binding);
  }

  function render(binding: Binding) {
    const sources = WhatsApp.previewSources(binding);
    let source: HTMLElement | undefined, result: Result | undefined;
    for (const node of sources) {
      const found = results.get(key(binding.conversation, WhatsApp.previewSourceText(node)));
      if (found) {
        source = node;
        result = found;
        break;
      }
    }
    if (
      binding.source === source &&
      binding.original === result?.original &&
      binding.text === result?.text &&
      source?.classList.contains('wisp-chat-preview-original') &&
      source?.nextElementSibling?.matches('.wisp-chat-preview')
    )
      return;
    binding.restore?.();
    binding.restore = undefined;
    binding.source = source;
    binding.original = result?.original;
    binding.text = result?.text;
    if (source && result) binding.restore = chatPreview(source, result.text, result.original);
  }

  function scan() {
    const { active, enabled } = session();
    const selected = WhatsApp.sidebarChat(active.selection);
    for (const binding of bindings.values()) {
      const current = WhatsApp.sidebarChat(binding.element);
      if (
        !current ||
        current.title !== binding.title ||
        current.avatar !== binding.avatar ||
        current.identity !== binding.identity ||
        (selected?.element !== binding.element &&
          (!binding.source ||
            !binding.element.contains(binding.source) ||
            WhatsApp.previewSourceText(binding.source) !==
              WhatsApp.previewText(binding.original || ''))) ||
        (selected?.element === binding.element &&
          (!enabled || active.conversation !== binding.conversation))
      )
        remove(binding);
    }
    if (selected && enabled && active.conversation && !bindings.has(selected.element)) {
      bindings.set(selected.element, { ...selected, conversation: active.conversation });
      while (bindings.size > 64) remove(bindings.values().next().value!);
    }
    for (const binding of bindings.values()) render(binding);
  }

  function observe(mutations: readonly MutationRecord[]) {
    // Virtualized rows can be detached and reused before the debounced scan.
    // Their old conversation binding ends at removal, even if the text matches.
    for (const binding of bindings.values())
      if (
        mutations.some(
          (mutation) =>
            mutation.type === 'childList' &&
            [...mutation.removedNodes].some((node) => node.contains(binding.element)),
        )
      )
        remove(binding);
  }

  function remember(message: Message, text: string) {
    const { active, enabled } = session();
    if (!enabled || !active.conversation || !text.trim()) return;
    const id = key(active.conversation, message.text);
    results.delete(id);
    if (WhatsApp.previewText(text) !== WhatsApp.previewText(message.text))
      results.set(id, {
        conversation: active.conversation,
        original: message.text,
        text,
        direction: message.direction,
      });
    while (results.size > 512) results.delete(results.keys().next().value!);
    scan();
  }
  return { scan, remember, configure, observe, clear };
}
