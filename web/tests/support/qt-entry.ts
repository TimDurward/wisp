import { WhatsApp as WispAdapter } from '../../src/whatsapp';
import { UI as WispUI } from '../../src/ui';
import { FocusLayout as WispLayout } from '../../src/ui/focus';
import type { DraftState } from '../../src/contracts';
const actions = {
  preview() {},
  prepare() {
    return false;
  },
  edit() {},
  async copy() {},
};
const baseState: DraftState = {
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

function createFixture() {
  const initial = document.querySelector<HTMLElement>('#chat')!,
    initialPseudo = getComputedStyle(initial, '::before');
  const boot = {
    width: initialPseudo.width,
    height: initialPseudo.height,
    content: initialPseudo.content,
    position: initialPseudo.position,
    top: initialPseudo.top,
    left: initialPseudo.left,
    boundsHeight: initial.getBoundingClientRect().height,
  };
  // Captured WhatsApp structure: decorative split panes are
  // siblings of the real chat, with borders at the old offsets.
  const shell = document.querySelector<HTMLElement>('#shell')!;
  shell.style.position = 'relative';
  const paint = document.createElement('div');
  paint.style.cssText =
    'position:absolute;inset:0;display:flex;padding-left:64px;box-sizing:border-box;pointer-events:none';
  paint.innerHTML =
    '<div style="position:relative;width:40%;height:100%;box-sizing:border-box;border-left:1px solid red"><span style="position:absolute;inset:0"></span></div><div style="position:relative;flex:1;height:100%;box-sizing:border-box;border-left:1px solid red"><span style="position:absolute;inset:0"></span></div>';
  shell.prepend(paint);
  let boldKeys = 0;
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'b' && (event.ctrlKey || event.metaKey)) boldKeys++;
  });
  WispLayout.preview(true);
  WispLayout.configure(true); // Confirm the native preference before testing restore.
  const wallpaper = document.createElement('div');
  wallpaper.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(#111b21,#111b21)';
  document.body.prepend(wallpaper);
  const main = document.querySelector<HTMLElement>('#main')!;
  let ui = WispUI.composer(WispAdapter.composer(main)!, actions),
    expected = 'Hello';
  ui.update({
    ...baseState,
    source: 'Hello',
    text: 'Hola, ¿cómo estás? 😊',
    phase: 'ready',
    mode: 'source',
    livePreview: true,
    enterPrepares: true,
  });
  const message = WispAdapter.messages(main)[0]!;
  message.text = 'Original multiline text\n'.repeat(100);
  WispUI.reading(message, 'A short translated message');
  const original = message.element.querySelector<HTMLButtonElement>('.wisp-original-button')!;
  original.dispatchEvent(new Event('mouseenter'));
  return {
    diagnostic: () => {
      const raw = WispLayout.diagnostics(),
        report = JSON.parse(raw) as {
          main: boolean;
          focused: boolean;
          nodes: { background?: { id: string }; box: number[] }[];
        };
      return (
        report.main &&
        report.focused &&
        raw.length < 128000 &&
        report.nodes.some((node) => node.background?.id && node.box[2] === innerWidth) &&
        !raw.includes('Original multiline text') &&
        !raw.includes('123@lid')
      );
    },
    keys: () => boldKeys,
    focus: () => WispAdapter.focusDraft(main, expected),
    selected: () => WispAdapter.selectedDraft(main, expected),
    attachment: () => {
      ui.remove();
      const media = document.createElement('section');
      media.dataset.testid = 'media-editor';
      media.style.cssText = 'position:fixed;inset:0;background:#161616;z-index:1000';
      media.innerHTML =
        '<div data-testid="media-caption-input-container" style="position:absolute;bottom:70px;left:100px;width:500px;box-sizing:border-box;min-height:44px;padding:12px;background:#202c33;border-radius:8px"><div role="textbox" contenteditable="true">Look at this 😊</div></div><footer style="position:absolute;bottom:10px;right:15px"><button aria-label="Send">Send attachment</button></footer>';
      document.body.append(media);
      expected = 'Look at this 😊';
      const slot = WispAdapter.composer(main);
      if (slot?.kind !== 'attachment') return false;
      ui = WispUI.composer(slot, actions);
      ui.update({
        ...baseState,
        source: expected,
        text: 'Mira esto 😊',
        phase: 'ready',
        mode: 'source',
        livePreview: true,
        enterPrepares: true,
      });
      return WispAdapter.focusDraft(main, expected);
    },
    background: () => document.querySelector<HTMLElement>('#editor')!.innerText.trim(),
    text: () => WispAdapter.draft(main),
    focusLayout: () => {
      const shell = document.querySelector<HTMLElement>('#shell')!.getBoundingClientRect(),
        chat = document.querySelector<HTMLElement>('#chat')!,
        bounds = chat.getBoundingClientRect();
      const paintBounds = [...paint.children].map((node) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        return [r.left, r.width] as const;
      });
      const paintFocused = [...paint.children].every((node) => {
        return (
          getComputedStyle(node).borderLeftWidth === '0px' &&
          !node.classList.contains('wisp-focus-stretch') &&
          getComputedStyle(node).display !== 'none'
        );
      });
      const focused =
        Math.abs(bounds.left - shell.left) < 1 &&
        Math.abs(bounds.width - shell.width) < 1 &&
        getComputedStyle(chat).borderLeftWidth === '0px' &&
        getComputedStyle(chat, '::before').display === 'none' &&
        getComputedStyle(document.querySelector<HTMLElement>('#divider')!).display === 'none' &&
        getComputedStyle(document.querySelector<HTMLElement>('#messages')!).borderLeftWidth ===
          '0px' &&
        getComputedStyle(document.querySelector<HTMLElement>('#messages')!, '::after')
          .borderLeftWidth === '0px' &&
        getComputedStyle(message.element).borderLeftWidth === '1px' &&
        paintFocused;
      const debug = {
        boot,
        classes: chat.className,
        left: bounds.left,
        width: bounds.width,
        shellWidth: shell.width,
        border: getComputedStyle(chat).borderLeftWidth,
        before: getComputedStyle(chat, '::before').display,
        pseudoHeight: getComputedStyle(chat, '::before').height,
        divider: getComputedStyle(document.querySelector<HTMLElement>('#divider')!).display,
      };
      WispLayout.configure(false);
      const restored =
        chat.getBoundingClientRect().left > shell.left + 100 &&
        getComputedStyle(chat).borderLeftWidth === '1px' &&
        getComputedStyle(chat, '::before').display !== 'none' &&
        getComputedStyle(document.querySelector<HTMLElement>('#divider')!).display !== 'none' &&
        getComputedStyle(document.querySelector<HTMLElement>('#messages')!).borderLeftWidth ===
          '1px' &&
        getComputedStyle(document.querySelector<HTMLElement>('#messages')!, '::after')
          .borderLeftWidth === '1px' &&
        [...paint.children].every((node) => getComputedStyle(node).borderLeftWidth === '1px');
      const paintUnchanged = [...paint.children].every((node, index) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        return (
          Math.abs(r.left - paintBounds[index]![0]) < 1 &&
          Math.abs(r.width - paintBounds[index]![1]) < 1
        );
      });
      WispLayout.configure(true);
      return {
        passed: focused && restored && paintUnchanged,
        focused,
        restored,
        paintFocused,
        paintUnchanged,
        ...debug,
      };
    },
    readingLayout: () => {
      const translated = message.element
        .querySelector<HTMLElement>('.wisp-translation-text')!
        .getBoundingClientRect();
      const time = document.querySelector<HTMLElement>('#time')!.getBoundingClientRect();
      const anchor = original.getBoundingClientRect(),
        popup = document
          .querySelector<HTMLElement>('.wisp-original-popup')!
          .getBoundingClientRect();
      return (
        translated.bottom <= time.top &&
        popup.height >= 40 &&
        popup.top >= 12 &&
        popup.bottom <= innerHeight - 12 &&
        (popup.bottom <= anchor.top - 8 || popup.top >= anchor.bottom + 8)
      );
    },
    layout: () => {
      const slot = WispAdapter.composer(main)!,
        host = slot.panel.getBoundingClientRect(),
        preview = ui.element.getBoundingClientRect(),
        input = slot.input.getBoundingClientRect();
      return (
        preview.top >= host.top &&
        preview.bottom <= input.top &&
        (slot.kind === 'attachment'
          ? host.bottom <= innerHeight && host.bottom > innerHeight * 0.5
          : host.bottom > innerHeight - 30)
      );
    },
  };
}

declare global {
  interface Window {
    editorCheck: ReturnType<typeof createFixture>;
  }
}
window.editorCheck = createFixture();
