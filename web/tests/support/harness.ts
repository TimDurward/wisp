import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { withGlobal } from '@sinonjs/fake-timers';
import type {
  Config,
  NativeEvent,
  NativeChannel,
  PageRequest,
  ViewPreferences,
  VoiceTranscript,
} from '../../src/contracts';
import { element, required } from './fixtures';
const bundle = readFileSync(new URL('../../dist/testing.js', import.meta.url), 'utf8');
type FixtureEvent =
  | Exclude<NativeEvent, Config>
  | (Pick<Config, 'type' | 'conversation' | 'revision' | 'enabled'> &
      Partial<
        Omit<Config, 'type' | 'conversation' | 'revision' | 'enabled' | 'view_preferences'>
      > & { view_preferences?: Partial<ViewPreferences> });

export function setup({
  saved = new Map<string, string>(),
  savedVoices = new Map<
    string,
    { transcript: VoiceTranscript; language: string | null; translation: string | null }
  >(),
  autoHydrate = true,
} = {}) {
  // Test-only markup for the adapter contract; never packaged into Wisp.
  const dom = new JSDOM(
    `<main id="main"><header><span title="Contact">Contact</span></header>
    <div data-id="false_123@lid_ONE"><div class="message-in"><span class="selectable-text copyable-text">Hola<br>¿Vienes? <img alt="😊" aria-hidden="true"></span></div></div>
    <footer><div role="textbox" contenteditable="true">See you soon</div><button id="send">Send</button></footer></main><script>${bundle}</script>`,
    { url: 'https://web.whatsapp.com/', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  const w = dom.window;
  const clock = withGlobal(w).install({
    now: Date.now(),
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'],
  });
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => {
    w.testRuntime?.dispose();
    clock.uninstall();
    close();
  };
  w.TextEncoder = TextEncoder;
  w.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  const getStyle = w.getComputedStyle.bind(w);
  w.getComputedStyle = (node, pseudo) => {
    if (!pseudo) return getStyle(node);
    const style = w.document.createElement('div').style;
    style.content = 'none';
    style.width = style.height = 'auto';
    return style;
  };
  w.document.execCommand = (command, _, text) => {
    if (command === 'copy') return true;
    if (command !== 'insertText') return false;
    const range = required(w.getSelection()).getRangeAt(0);
    range.deleteContents();
    range.insertNode(w.document.createTextNode(required(text)));
    required(w.document.activeElement).dispatchEvent(new w.Event('input', { bubbles: true }));
    return true;
  };
  const sent: PageRequest[] = [],
    translations = new Map<string, string>();
  let callback: (payload: string) => void = () => {
    throw new Error('Channel is not connected');
  };
  const native: NativeChannel = {
    submit(payload) {
      const value = JSON.parse(payload) as PageRequest;
      sent.push(value);
      if (value.type === 'saved_voice' && autoHydrate) {
        const saved = savedVoices.get(value.message_id);
        queueMicrotask(() =>
          callback(
            JSON.stringify({
              type: 'voice_saved',
              request_id: value.request_id,
              conversation: value.conversation,
              view_id: value.view_id,
              transcript: saved?.transcript || null,
              language: saved?.language || null,
              translation: saved?.translation || null,
            }),
          ),
        );
      }
      if (value.type === 'saved_messages' && autoHydrate)
        queueMicrotask(() =>
          callback(
            JSON.stringify({
              type: 'saved_messages',
              request_id: value.request_id,
              conversation: value.conversation,
              view_id: value.view_id,
              items: value.messages
                .filter((message) => saved.has(message.message_id))
                .map((message) => ({
                  message_id: message.message_id,
                  text: saved.get(message.message_id),
                })),
            }),
          ),
        );
    },
    translationEvent: {
      connect(fn) {
        callback = fn;
      },
    },
  };
  w.qt = { webChannelTransport: {} };
  w.QWebChannel = class {
    constructor(_: unknown, ready: (channel: { objects: { translation: NativeChannel } }) => void) {
      ready({ objects: { translation: native } });
    }
  };
  w.testAdapter.visible = () => true;
  w.testAdapter.voiceVisible = () => true;
  return {
    dom,
    w,
    sent,
    requests<T extends PageRequest['type']>(type: T) {
      return sent.filter(
        (value): value is Extract<PageRequest, { type: T }> => value.type === type,
      );
    },
    flush: () => clock.tickAsync(220),
    advance: (milliseconds: number) => clock.tickAsync(milliseconds),
    start: () => w.testApp(),
    prepare: () => element<HTMLButtonElement>(w.document, '.wisp-prepare').click(),
    dispatchInput: (
      type: 'input' | 'compositionstart' | 'compositionend',
      target: HTMLElement,
      fields: InputEventInit & CompositionEventInit = {},
    ) => {
      const EventType = type === 'input' ? w.InputEvent : w.CompositionEvent;
      target.dispatchEvent(new EventType(type, { bubbles: true, ...fields }));
    },
    commitEdit: ({
      accepted = true,
      beforeSelect,
    }: { accepted?: boolean; beforeSelect?: () => void } = {}) => {
      const edit = required(sent.findLast((v) => v.type === 'edit_draft'));
      const request = required(
        sent
          .filter((v) => v.type === 'translate')
          .find((v) => v.request_id === edit.ticket && v.purpose === 'reply'),
      );
      const text = edit.restore ? request.text : required(translations.get(edit.ticket));
      const helper = required(w.__wispDraftEditing);
      if (!helper.begin({ ...edit, text })) return false;
      const input = required(w.testAdapter.composer()).input;
      const range = w.document.createRange();
      range.selectNodeContents(input);
      const selection = required(w.getSelection());
      selection.removeAllRanges();
      selection.addRange(range);
      beforeSelect?.();
      const selected = helper.selected(edit.edit_id);
      if (selected && accepted) {
        input.textContent = text;
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
      }
      helper.settle(edit.edit_id, selected === true && accepted);
      return selected === true && accepted;
    },
    emit(value: FixtureEvent) {
      if (value.type === 'translation') translations.set(value.request_id, value.text);
      callback(
        JSON.stringify({
          view_preferences: { live_preview: false },
          view_id: sent.findLast((v) => v.type === 'active_conversation')?.view_id,
          ...value,
        }),
      );
    },
  };
}
