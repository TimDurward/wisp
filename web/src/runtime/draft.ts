import { WhatsApp } from '../whatsapp';
import { UI } from '../ui';
import { onlyLinks } from '../links';
import type {
  Config,
  ComposerSlot,
  ComposerUI,
  DraftServices,
  DraftState,
  NativeEdit,
  NativeEvent,
} from '../contracts';
export function createDraft({ submit, context, isCurrentView }: DraftServices) {
  const lifecycle = new AbortController();
  function listen<K extends keyof DocumentEventMap>(
    name: K,
    handler: (event: DocumentEventMap[K]) => void,
    capture = false,
  ) {
    document.addEventListener(name, handler, { capture, signal: lifecycle.signal });
  }
  let main: HTMLElement | null = null,
    slot: ComposerSlot | null = null,
    ui: ComposerUI | null = null,
    config: Config | null = null;
  let timer: number | undefined,
    request: {
      id: string;
      source: string;
      conversation: string;
      viewId: string;
      timeout?: number;
    } | null = null,
    lastRequestedAt = 0,
    originalSource = '';
  let inputObserver: MutationObserver | null = null,
    composing = false,
    pendingEdit: {
      id: string;
      source: string;
      text: string;
      restore: boolean;
      viewId: string;
    } | null = null,
    editTimer: number | undefined,
    ticket = '';
  const state: DraftState = {
    source: '',
    text: '',
    phase: 'empty',
    mode: 'source',
    error: '',
    livePreview: true,
    enterPrepares: true,
    hasRules: false,
    originalSource: '',
  };
  const currentEditor = () =>
    slot?.input.isConnected && WhatsApp.composer(main)?.input === slot.input;
  function render() {
    ui?.update(state);
  }
  function cancel() {
    window.clearTimeout(timer);
    timer = undefined;
    if (request) {
      window.clearTimeout(request.timeout);
      submit({
        type: 'cancel_translation',
        request_id: request.id,
        conversation: request.conversation,
      });
      request = null;
    }
  }
  function reset() {
    inputObserver?.disconnect();
    inputObserver = null;
    composing = false;
    window.clearTimeout(editTimer);
    pendingEdit = null;
    ticket = '';
    cancel();
    ui?.remove();
    ui = null;
    main = null;
    slot = null;
    config = null;
    Object.assign(state, {
      source: '',
      text: '',
      phase: 'empty',
      mode: 'source',
      error: '',
      originalSource: '',
    });
    originalSource = '';
  }
  function changed() {
    if (!config || !currentEditor() || composing) return;
    const source = WhatsApp.draft(main);
    if (pendingEdit && (source === pendingEdit.source || source === pendingEdit.text)) return;
    if (pendingEdit) failEdit('Draft changed. Translate it again.');
    if (source === state.source) return;
    cancel();
    state.source = source;
    state.error = '';
    if (!source || onlyLinks(source)) {
      originalSource = '';
      Object.assign(state, { text: '', phase: 'empty', mode: 'source', originalSource: '' });
    } else if (state.mode === 'translated') {
      state.phase = 'prepared';
    } else {
      state.phase = state.livePreview ? 'waiting' : 'empty';
      if (state.livePreview) schedule();
    }
    render();
  }
  function schedule() {
    window.clearTimeout(timer);
    // Coalesce typing pauses and cap live requests to one every two seconds.
    const delay = Math.max(900, 2000 - (Date.now() - lastRequestedAt));
    timer = window.setTimeout(() => {
      timer = undefined;
      preview();
    }, delay);
  }
  function preview() {
    if (
      !config ||
      composing ||
      pendingEdit ||
      state.mode === 'translated' ||
      !currentEditor() ||
      !isCurrentView()
    )
      return;
    changed();
    const source = WhatsApp.draft(main);
    if (!source || onlyLinks(source) || request?.source === source) return;
    if (WhatsApp.byteLength(source) > 8000) {
      state.error = 'This draft is too long to translate.';
      state.phase = 'error';
      render();
      return;
    }
    cancel();
    state.source = source;
    state.phase = 'translating';
    state.error = '';
    render();
    const id = crypto.randomUUID(),
      conversation = config.conversation;
    request = { id, source, conversation, viewId: config.view_id };
    lastRequestedAt = Date.now();
    request.timeout = window.setTimeout(() => {
      if (request?.id !== id) return;
      cancel();
      state.phase = 'error';
      state.error = 'Translation timed out. Preview it again.';
      render();
    }, 100000);
    submit({
      type: 'translate',
      request_id: id,
      conversation,
      message_id: `draft:${id}`,
      direction: 'outgoing',
      purpose: 'reply',
      text: source,
      context: context(),
    });
  }
  function accept(value: NativeEvent) {
    if (value.type === 'draft_edit_error' && value.edit_id === pendingEdit?.id) {
      failEdit(value.message);
      return true;
    }
    if (
      value.type !== 'translation_progress' &&
      value.type !== 'translation' &&
      value.type !== 'translation_error'
    )
      return false;
    if (!request || value.request_id !== request.id || value.conversation !== request.conversation)
      return false;
    if (
      !config ||
      config.view_id !== request.viewId ||
      !currentEditor() ||
      WhatsApp.draft(main) !== request.source ||
      !isCurrentView()
    ) {
      cancel();
      return true;
    }
    if (value.type === 'translation_progress') {
      state.text = value.text;
      state.phase = 'translating';
      render();
      return true;
    }
    window.clearTimeout(request.timeout);
    request = null;
    if (value.type === 'translation_error') {
      state.phase = 'error';
      state.error = value.message;
    } else {
      state.text = value.text;
      ticket = value.request_id;
      state.phase = 'ready';
      state.error = '';
    }
    render();
    return true;
  }
  function failEdit(message: string) {
    const restore = pendingEdit?.restore;
    window.clearTimeout(editTimer);
    pendingEdit = null;
    state.phase = restore ? 'prepared' : 'ready';
    state.error = message;
    render();
  }
  function requestEdit(restore: boolean) {
    const id = crypto.randomUUID(),
      source = WhatsApp.draft(main);
    if (!config) return;
    pendingEdit = {
      id,
      source,
      text: restore ? originalSource : state.text,
      restore,
      viewId: config.view_id,
    };
    state.phase = 'preparing';
    state.error = '';
    render();
    editTimer = window.setTimeout(
      () => failEdit('Could not update the draft. Try again or copy the translation.'),
      5000,
    );
    submit({
      type: 'edit_draft',
      edit_id: id,
      ticket,
      conversation: config.conversation,
      view_id: config.view_id,
      source,
      restore,
    });
  }
  function prepare() {
    if (composing || pendingEdit || !currentEditor() || !isCurrentView()) return false;
    changed();
    if (state.phase !== 'ready' || !state.text || !ticket || state.mode !== 'source') {
      state.error = 'Wait for the preview to finish.';
      render();
      return false;
    }
    requestEdit(false);
    return true;
  }
  function edit() {
    if (!originalSource || pendingEdit || !currentEditor() || !isCurrentView()) return;
    requestEdit(true);
  }
  function beginNative(value: NativeEdit) {
    if (!pendingEdit || pendingEdit.id !== value.edit_id) return false;
    if (
      !config ||
      pendingEdit.viewId !== value.view_id ||
      value.conversation !== config.conversation ||
      value.source !== pendingEdit.source ||
      value.text !== pendingEdit.text ||
      value.restore !== pendingEdit.restore ||
      composing ||
      !currentEditor() ||
      !isCurrentView() ||
      !WhatsApp.focusDraft(main, value.source)
    ) {
      failEdit('The draft or chat changed. Preview again before preparing.');
      return false;
    }
    return true;
  }
  function selectedNative(id: string) {
    if (
      !pendingEdit ||
      pendingEdit.id !== id ||
      !isCurrentView() ||
      !currentEditor() ||
      WhatsApp.draft(main) !== pendingEdit.source
    )
      return null;
    return WhatsApp.selectedDraft(main, pendingEdit.source);
  }
  function settleNative(id: string, accepted: boolean) {
    if (pendingEdit?.id !== id) return;
    if (!accepted) {
      failEdit('Could not update the draft. Copy and paste the translation.');
      return;
    }
    const deadline = Date.now() + 1200;
    function verify() {
      if (pendingEdit?.id !== id) return;
      if (!currentEditor() || !isCurrentView()) {
        failEdit('The editor or chat changed. Preview your draft again.');
        return;
      }
      const edit = pendingEdit,
        source = WhatsApp.draft(main);
      if (source === edit.text.trim()) {
        window.clearTimeout(editTimer);
        pendingEdit = null;
        if (edit.restore) {
          state.mode = 'source';
          state.source = '';
          changed();
        } else {
          originalSource = edit.source;
          Object.assign(state, {
            source,
            originalSource,
            mode: 'translated',
            phase: 'prepared',
            error: '',
          });
          render();
        }
      } else if (Date.now() < deadline && source === edit.source)
        editTimer = window.setTimeout(verify, 40);
      else {
        failEdit('WhatsApp did not accept the draft. Copy the translation and paste it.');
      }
    }
    window.clearTimeout(editTimer);
    verify();
  }
  async function copy() {
    if (!ui || state.phase !== 'ready' || WhatsApp.draft(main) !== state.source) return;
    const copied = await UI.copy(state.text, ui.preview);
    state.error = copied ? '' : 'Translation is selected. Press ⌘C / Ctrl+C to copy.';
    render();
  }
  function bind(nextMain: HTMLElement | null, nextConfig: Config) {
    const nextSlot = WhatsApp.composer(nextMain);
    if (!nextSlot) {
      reset();
      return;
    }
    const changedContext =
      config &&
      (config.view_id !== nextConfig.view_id ||
        config.revision !== nextConfig.revision ||
        config.conversation !== nextConfig.conversation);
    if (slot?.input !== nextSlot.input || main !== nextMain) reset();
    else if (changedContext) {
      cancel();
      if (pendingEdit) failEdit('Chat options changed. Preview again before preparing.');
      if (state.mode === 'source') {
        state.source = '';
        state.text = '';
      }
    }
    if (slot && slot.panel !== nextSlot.panel) {
      ui?.remove();
      ui = null;
    }
    main = nextMain;
    slot = nextSlot;
    config = nextConfig;
    if (!inputObserver) {
      // WhatsApp may clear a sent draft without an input event. Observe that
      // immediately so the next reply starts in source mode again.
      inputObserver = new MutationObserver(() => {
        if (!composing) changed();
      });
      inputObserver.observe(slot.input, { childList: true, characterData: true, subtree: true });
    }
    const prefs = nextConfig.view_preferences;
    const liveWas = state.livePreview;
    const replyLanguage = nextConfig.reply_language || 'spanish';
    Object.assign(state, {
      livePreview: prefs.live_preview,
      enterPrepares: prefs.enter_prepares,
      hasRules: !!nextConfig.has_rules,
      replyLabel: nextConfig.reply_label || 'Spanish · Peru',
      replyLanguageLabel:
        nextConfig.reply_label?.split(' · ')[0] ||
        replyLanguage.charAt(0).toUpperCase() + replyLanguage.slice(1),
    });
    if (!ui?.element.isConnected) ui = UI.composer(slot, { preview, prepare, edit, copy });
    changed();
    if (!liveWas && state.livePreview && state.source && state.mode === 'source') schedule();
    if (!state.livePreview) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    render();
  }
  listen('input', (event) => {
    if (slot?.input.contains(event.target instanceof Node ? event.target : null)) {
      if ((event as InputEvent).isComposing) {
        composing = true;
        cancel();
        state.source = '';
        state.phase = 'waiting';
        render();
      } else changed();
    }
  });
  listen('compositionstart', (event) => {
    if (slot?.input.contains(event.target instanceof Node ? event.target : null)) {
      composing = true;
      cancel();
      state.source = '';
      state.phase = 'waiting';
      render();
    }
  });
  listen('compositionend', (event) => {
    if (slot?.input.contains(event.target instanceof Node ? event.target : null)) {
      composing = false;
      changed();
    }
  });
  listen(
    'keydown',
    (event) => {
      if (
        !event.isTrusted ||
        event.isComposing ||
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !config ||
        !state.enterPrepares ||
        !slot?.input.contains(event.target instanceof Node ? event.target : null)
      )
        return;
      if (event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!pendingEdit && (state.mode === 'translated' || onlyLinks(WhatsApp.draft(main)))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      prepare();
    },
    true,
  );
  listen(
    'click',
    (event) => {
      if (
        !event.isTrusted ||
        !config ||
        !state.enterPrepares ||
        (state.mode === 'translated' && !pendingEdit) ||
        (!pendingEdit && onlyLinks(WhatsApp.draft(main))) ||
        !WhatsApp.sendAction(event.target instanceof Element ? event.target : null, main)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      prepare();
    },
    true,
  );
  return {
    bind,
    reset,
    accept,
    beginNative,
    selectedNative,
    settleNative,
    dispose() {
      reset();
      lifecycle.abort();
    },
  };
}

export const Draft = { create: createDraft };
