import { WhatsApp } from '../whatsapp';
import { UI } from '../ui';
import { FocusLayout } from '../ui/focus';
import { createDraft } from './draft';
import { createReadingQueue } from './reading';
import { watchAppearance, refreshAppearance } from '../ui/appearance';
import { createVoices } from './voice';
import type {
  Chat,
  View,
  Config,
  ViewPreferences,
  NativeChannel,
  NativeEvent,
  Submit,
} from '../contracts';

export function createRuntime(native: NativeChannel, diagnostics = false) {
  const lifecycle = new AbortController();
  function listen<K extends keyof DocumentEventMap>(
    name: K,
    handler: (event: DocumentEventMap[K]) => void,
    options: boolean | AddEventListenerOptions = false,
  ) {
    document.addEventListener(name, handler, {
      ...(typeof options === 'boolean' ? { capture: options } : options),
      signal: lifecycle.signal,
    });
  }
  if (diagnostics)
    Object.defineProperty(window, '__wispReadStructure', {
      configurable: true,
      value: WhatsApp.diagnostics,
    });
  let active: View = {
    conversation: '',
    peer: '',
    title: '',
    main: null,
    header: null,
    selection: null,
    messageIds: [],
    detection: 'no_chat',
    viewId: crypto.randomUUID(),
  };
  let enabled = false,
    revision = -1,
    timer: number | undefined,
    config: Config | null = null;
  const defaults: ViewPreferences = {
    reading_view: 'translation_first',
    include_sent: true,
    live_preview: true,
    enter_prepares: true,
    focus_chat: false,
    original_on_hover: true,
  };
  let preferences = { ...defaults };
  let navigationSerial = 0,
    emptyNavigationSerial = 0,
    viewNavigationSerial = 0,
    historyIntent: number | null = null;
  const submit: Submit = (value) => native.submit(JSON.stringify(value));
  const stopAppearance = watchAppearance((dark) => submit({ type: 'appearance', dark }));
  const voices = createVoices({
    submit,
    session: () => ({ active, enabled, config, preferences }),
    isCurrentView: () => currentView(WhatsApp.active()),
  });
  const readings = createReadingQueue({
    submit,
    session: () => ({ active, enabled, config, preferences }),
    currentRecords,
    schedule,
  });
  const draft = createDraft({
    submit,
    context: () => WhatsApp.context(WhatsApp.messages(active.main)),
    isCurrentView: () => !!(enabled && config?.can_translate) && currentView(WhatsApp.active()),
  });
  // Callable only from trusted QML in this isolated world. No main-world endpoint.
  Object.defineProperty(window, '__wispDraftEditing', {
    configurable: true,
    value: Object.freeze({
      begin: draft.beginNative,
      selected: draft.selectedNative,
      settle: draft.settleNative,
    }),
  });
  Object.defineProperty(window, '__wispLayout', {
    configurable: true,
    value: Object.freeze({ preview: FocusLayout.preview, cancel: FocusLayout.cancel }),
  });
  Object.defineProperty(window, '__wispReadLayout', {
    configurable: true,
    value: FocusLayout.diagnostics,
  });
  function viewChanged(next: Chat) {
    const disjoint =
      next.messageIds.length &&
      active.messageIds.length &&
      !next.messageIds.some((id) => active.messageIds.includes(id));
    return (
      (next.conversation !== active.peer && !(active.detection === 'empty' && !active.peer)) ||
      next.title !== active.title ||
      next.main !== active.main ||
      next.header !== active.header ||
      next.selection !== active.selection ||
      (active.detection === 'empty' && emptyNavigationSerial !== viewNavigationSerial) ||
      (disjoint && !next.conversation && historyIntent !== navigationSerial)
    );
  }
  function currentView(next: Chat) {
    const current = ['ready', 'empty'].includes(next.detection) && !viewChanged(next);
    if (!current) schedule();
    return current;
  }
  function currentRecords() {
    const main = document.querySelector<HTMLElement>(WhatsApp.selectors.main);
    const rows = WhatsApp.records(main);
    return currentView(WhatsApp.active(rows)) ? rows : null;
  }
  function reset() {
    enabled = false;
    config = null;
    readings.clear();
    voices.clear();
    draft.reset();
  }
  function scan() {
    timer = undefined;
    // Reuse this synchronous DOM snapshot through the scan. Never cache rows
    // across events: WhatsApp can replace a chat or recycle its message nodes.
    const rows = WhatsApp.records(document.querySelector<HTMLElement>(WhatsApp.selectors.main));
    const next = WhatsApp.active(rows);
    refreshAppearance();
    FocusLayout.refresh();
    const idsChanged = next.messageIds.join('|') !== active.messageIds.join('|');
    const changedView = viewChanged(next);
    // Keep the established view through a transient history-loading gap.
    if (
      !changedView &&
      next.detection === 'waiting_for_messages' &&
      active.conversation &&
      historyIntent === navigationSerial
    )
      return;
    if (changedView || next.detection !== active.detection || idsChanged) {
      if (changedView) {
        reset();
        revision = -1;
        active.conversation = '';
        active.viewId = crypto.randomUUID();
        historyIntent = null;
      }
      active = {
        ...next,
        peer: next.conversation,
        conversation: active.conversation,
        viewId: active.viewId,
      };
      viewNavigationSerial = emptyNavigationSerial;
      submit({
        type: 'active_conversation',
        conversation: next.conversation,
        title: next.title,
        detection: next.detection,
        view_id: active.viewId,
        message_ids: next.messageIds,
      });
    }
    if (!enabled || !active.conversation) return;
    if (config?.can_translate) draft.bind(active.main, config);
    readings.scan(rows);
    voices.scan(rows);
  }
  function schedule() {
    if (!timer) timer = window.setTimeout(scan, 160);
  }
  native.translationEvent.connect((payload) => {
    let value: NativeEvent;
    try {
      value = JSON.parse(payload) as NativeEvent;
    } catch {
      return;
    }
    if (value.type === 'config') {
      if (value.view_id !== active.viewId) return;
      if (value.revision < revision) return;
      if (active.conversation !== value.conversation) {
        reset();
        active.conversation = value.conversation;
      }
      value = Object.assign(
        {
          can_translate: true,
          history_revision: 0,
          reading_label: 'English',
          reading_language: 'english',
          reply_label: 'Spanish · Peru',
          reply_language: 'spanish',
        },
        value,
      );
      const clear =
        enabled !== value.enabled ||
        (config &&
          (config.history_revision !== value.history_revision ||
            config.reading_label !== value.reading_label));
      if (
        clear ||
        revision !== value.revision ||
        config?.can_translate !== value.can_translate ||
        (config?.voice_enabled && !value.voice_enabled)
      )
        voices.clear();
      if (clear) readings.clear();
      else if (revision !== value.revision || config?.can_translate !== value.can_translate)
        readings.cancel();
      enabled = value.enabled;
      revision = value.revision;
      const nextPreferences = { ...defaults, ...value.view_preferences };
      if (
        preferences.reading_view !== nextPreferences.reading_view ||
        preferences.original_on_hover !== nextPreferences.original_on_hover
      )
        UI.removeReading();
      if (preferences.include_sent && !nextPreferences.include_sent) readings.hideSent();
      preferences = nextPreferences;
      FocusLayout.configure(preferences.focus_chat);
      config = { ...value, view_preferences: preferences };
      if (!enabled || !config.can_translate) draft.reset();
      else if (currentView(WhatsApp.active())) draft.bind(active.main, config);
      schedule();
    } else if (value.type === 'speech_model') {
      if (config) config.speech = value.speech;
      voices.scan();
    } else if (voices.accept(value)) {
      /* Voice jobs own their transcript and translation events. */
    } else if (value.type === 'saved_messages') readings.hydrate(value);
    else if (value.conversation === active.conversation && !draft.accept(value)) {
      if (
        value.type === 'translation' ||
        value.type === 'translation_error' ||
        value.type === 'translation_progress'
      )
        readings.accept(value);
    }
  });
  const observer = new MutationObserver((mutations) => {
    // Translation UI must not recursively trigger scans of its own inserted nodes.
    if (
      mutations.some(
        (m) =>
          !(m.target instanceof Element ? m.target : m.target.parentElement)?.closest(
            '[data-wisp]',
          ) &&
          (m.type !== 'childList' ||
            [...m.addedNodes, ...m.removedNodes].some(
              (n) => !(n instanceof HTMLElement && n.dataset.wisp),
            )),
      )
    )
      schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-id', 'title', 'aria-selected'],
  });
  // Continue a registered chat through virtualized history only after a real
  // scrolling gesture. Navigation outside the panel invalidates that intent.
  listen(
    'wheel',
    (event) => {
      if (
        event.isTrusted &&
        active.main?.contains(event.target instanceof Node ? event.target : null)
      )
        historyIntent = navigationSerial;
    },
    { capture: true, passive: true },
  );
  listen(
    'pointerdown',
    (event) => {
      if (!active.main?.contains(event.target instanceof Node ? event.target : null)) {
        emptyNavigationSerial++;
        if (active.detection === 'empty') schedule();
      }
      if (
        !active.main?.contains(event.target instanceof Node ? event.target : null) ||
        (event.target instanceof Element &&
          event.target.closest('button, a, [role="button"], [role="link"]'))
      ) {
        navigationSerial++;
        historyIntent = null;
      }
    },
    true,
  );
  listen(
    'keydown',
    (event) => {
      if (!active.main?.contains(event.target instanceof Node ? event.target : null)) {
        emptyNavigationSerial++;
        if (active.detection === 'empty') schedule();
      }
      const scrollKey = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(
        event.key,
      );
      if (
        event.isTrusted &&
        scrollKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        active.main?.contains(event.target instanceof Node ? event.target : null)
      )
        historyIntent = navigationSerial;
      else if (
        !active.main?.contains(event.target instanceof Node ? event.target : null) ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        navigationSerial++;
        historyIntent = null;
      }
    },
    true,
  );
  listen('scroll', schedule, true);
  // Initial state is sent even when the QR login has no active conversation.
  submit({
    type: 'active_conversation',
    conversation: '',
    title: '',
    detection: 'no_chat',
    view_id: active.viewId,
    message_ids: [],
  });
  scan();
  return {
    dispose() {
      window.clearTimeout(timer);
      observer.disconnect();
      readings.clear();
      voices.clear();
      draft.dispose();
      UI.remove();
      FocusLayout.configure(false);
      lifecycle.abort();
      stopAppearance();
      delete window.__wispDraftEditing;
      delete window.__wispLayout;
      delete window.__wispReadLayout;
      delete window.__wispReadStructure;
    },
  };
}
