import { required, element, rect } from './support/fixtures';
import { test, expect } from 'vitest';
import { setup } from './support/harness';

test('model output renders as text without executing HTML or changing the original', () => {
  const { dom, w } = setup();
  try {
    const message = required(w.testAdapter.messages()[0]);
    const payload = '<img src=x onerror="window.compromised=true">';
    w.testUI.reading(message, payload);
    expect(message.element.querySelector('.wisp-inline img')).toBe(null);
    expect(element(message.element, '.wisp-inline').textContent.includes(payload)).toBeTruthy();
    expect(w.compromised).toBe(undefined);
    expect(required(w.testAdapter.messages()[0]).text).toBe('Hola\n¿Vienes? 😊');
  } finally {
    dom.window.close();
  }
});

test('an edit is rejected if source changes between native focus and selection', async () => {
  const app = setup();
  try {
    const input = element(app.w.document, '[contenteditable]');
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const request = required(app.requests('translate').find((v) => v.purpose === 'reply'));
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: request.request_id,
      text: 'Nos vemos pronto',
    });
    app.prepare();
    expect(
      app.commitEdit({
        beforeSelect: () => {
          input.textContent = 'Changed';
        },
      }),
    ).toBe(false);
    expect(app.w.testAdapter.draft()).toBe('Changed');
  } finally {
    app.dom.window.close();
  }
});

test('the preview uses the local native composer shell and restores its layout on disable', async () => {
  const app = setup();
  try {
    const footer = element(app.w.document, 'footer');
    const wrapper = app.w.document.createElement('div'),
      pill = app.w.document.createElement('div');
    pill.innerHTML = footer.innerHTML;
    element<HTMLButtonElement>(pill, '#send').setAttribute('aria-label', 'Send');
    wrapper.append(pill);
    footer.replaceWith(wrapper);
    expect(required(app.w.testAdapter.composer()).panel).toBe(pill);
    pill.getBoundingClientRect = () =>
      rect({
        left: 20,
        right: 680,
        top: 220,
        bottom: 280,
        width: 660,
        height: 60,
      });
    element(pill, '[contenteditable]').getBoundingClientRect = () =>
      rect({
        left: 80,
        right: 620,
        top: 232,
        bottom: 268,
        width: 540,
        height: 36,
      });
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    expect(app.w.document.querySelector('.wisp-composer-top')).toBe(null);
    expect(pill.classList.contains('wisp-compose-shell')).toBeTruthy();
    expect(!wrapper.classList.contains('wisp-compose-shell')).toBeTruthy();
    expect(element(app.w.document, '.wisp-composer').style.left).toBe('68px');
    app.emit({ type: 'config', conversation: '123@lid', revision: 2, enabled: false });
    expect(!pill.classList.contains('wisp-compose-shell')).toBeTruthy();
    expect(pill.style.getPropertyValue('--wisp-preview-space')).toBe('');
  } finally {
    app.dom.window.close();
  }
});

test('focus chat hides the list branch without reparenting and restores it on logout', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main');
    const layout = app.w.document.createElement('div'),
      list = app.w.document.createElement('aside');
    list.innerHTML = '<div id="pane-side">Chats</div>';
    list.style.width = '300px';
    main.replaceWith(layout);
    layout.append(list, main);
    app.start();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: true },
    });
    await app.flush();
    expect(list.classList.contains('wisp-focus-hidden')).toBeTruthy();
    expect(main.classList.contains('wisp-focus-chat')).toBeTruthy();
    expect(main.parentElement).toBe(layout);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: false },
    });
    await app.flush();
    expect(!list.classList.contains('wisp-focus-hidden')).toBeTruthy();
    expect(list.style.width).toBe('300px');
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: true },
    });
    await app.flush();
    main.remove();
    await app.flush();
    expect(!list.classList.contains('wisp-focus-hidden')).toBeTruthy();
  } finally {
    app.dom.window.close();
  }
});

test('long original popups do not cover the trigger and stay open during hover handoff and scrolling', async () => {
  const app = setup();
  try {
    const message = required(app.w.testAdapter.messages()[0]);
    message.text = 'Original multiline text\n'.repeat(80);
    app.w.testUI.reading(message, 'Translated text');
    const original = element<HTMLButtonElement>(app.w.document, '.wisp-original-button');
    original.getBoundingClientRect = () =>
      rect({
        top: 500,
        bottom: 520,
        left: 50,
        right: 100,
        height: 20,
        width: 50,
      });
    original.dispatchEvent(new app.w.Event('mouseenter'));
    const popup = element(app.w.document, '.wisp-original-popup');
    popup.getBoundingClientRect = () =>
      rect({
        height: Math.min(1200, parseFloat(popup.style.maxHeight)),
      });
    app.w.dispatchEvent(new app.w.Event('resize'));
    expect(parseFloat(popup.style.top) + popup.getBoundingClientRect().height <= 492).toBeTruthy();
    original.dispatchEvent(new app.w.MouseEvent('mouseleave', { relatedTarget: popup }));
    popup.dispatchEvent(new app.w.Event('mouseenter'));
    await app.advance(280);
    popup.dispatchEvent(new app.w.Event('scroll'));
    expect(original.getAttribute('aria-expanded')).toBe('true');
    expect(parseFloat(popup.style.maxHeight) > 40).toBeTruthy();
    popup.dispatchEvent(new app.w.Event('mouseleave'));
    await app.advance(280);
    expect(original.getAttribute('aria-expanded')).toBe('false');
    expect(
      parseFloat(app.w.getComputedStyle(element(message.element, '.wisp-inline')).paddingBottom) >=
        20,
    ).toBeTruthy();
  } finally {
    app.dom.window.close();
  }
});

test('focus preview responds immediately without scanning message text or issuing AI requests', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main'),
      shell = app.w.document.createElement('div'),
      list = app.w.document.createElement('aside');
    list.innerHTML = '<div id="pane-side">Chats</div>';
    main.replaceWith(shell);
    shell.append(list, main);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: false });
    await app.flush();
    const originalActive = app.w.testAdapter.active;
    app.w.testAdapter.active = () => {
      throw new Error('Presentation must not wait for a message scan');
    };
    required(app.w.__wispLayout).preview(true);
    expect(list.classList.contains('wisp-focus-hidden')).toBeTruthy();
    expect(main.classList.contains('wisp-focus-chat')).toBeTruthy();
    required(app.w.__wispLayout).preview(false);
    expect(!list.classList.contains('wisp-focus-hidden')).toBeTruthy();
    app.w.testAdapter.active = originalActive;
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
  } finally {
    app.dom.window.close();
  }
});

test('focus removes nested pane spacing, grid columns, dividers and navigation rails and restores native styles', () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main'),
      shell = app.w.document.createElement('div');
    main.replaceWith(shell);
    shell.innerHTML =
      '<nav><button>Chats</button><button>Status</button></nav><aside><div id="pane-side">Contacts</div></aside><div role="separator" aria-orientation="vertical"></div><section id="outer"><div id="inner"></div></section>';
    element(shell, '#inner').append(main);
    shell.style.display = 'grid';
    shell.style.gridTemplateColumns = '64px 300px 1px 1fr';
    main.style.borderInlineStart = '1px solid red';
    main.style.marginInlineStart = '32px';
    const rail = element(shell, 'nav');
    rail.getBoundingClientRect = () => rect({ left: 0, right: 64, width: 64, height: 700 });
    main.getBoundingClientRect = () => rect({ left: 365, right: 1000, width: 635, height: 700 });
    app.w.testLayout.configure(true);
    for (const node of [main, element(shell, '#inner'), element(shell, '#outer')])
      expect(node.classList.contains('wisp-focus-chat')).toBeTruthy();
    expect(shell.classList.contains('wisp-focus-layout')).toBeTruthy();
    expect(rail.classList.contains('wisp-focus-hidden')).toBeTruthy();
    expect(
      element(shell, '[role="separator"]').classList.contains('wisp-focus-hidden'),
    ).toBeTruthy();
    for (let i = 0; i < 10; i++) app.w.testLayout.refresh();
    expect(rail.classList.contains('wisp-focus-hidden')).toBeTruthy();
    const replacement = element(shell, '#inner').cloneNode(true) as HTMLElement;
    element(shell, '#inner').replaceWith(replacement);
    replacement.classList.remove('wisp-focus-chat');
    element(replacement, '#main').classList.remove('wisp-focus-chat');
    app.w.testLayout.refresh();
    expect(replacement.classList.contains('wisp-focus-chat')).toBeTruthy();
    app.w.testLayout.configure(false);
    expect(shell.querySelectorAll('[class*="wisp-focus"]').length).toBe(0);
    expect(shell.style.gridTemplateColumns).toBe('64px 300px 1px 1fr');
    expect(element(replacement, '#main').style.marginInlineStart).toBe('32px');
  } finally {
    app.dom.window.close();
  }
});

test('an old focus configuration cannot undo a pending native preview', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main'),
      shell = app.w.document.createElement('div'),
      list = app.w.document.createElement('aside');
    list.innerHTML = '<div id="pane-side">Chats</div>';
    main.replaceWith(shell);
    shell.append(list, main);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: false });
    await app.flush();
    required(app.w.__wispLayout).preview(true);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: false },
    });
    expect(list.classList.contains('wisp-focus-hidden')).toBeTruthy();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: true },
    });
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: false,
      view_preferences: { focus_chat: false },
    });
    expect(!list.classList.contains('wisp-focus-hidden')).toBeTruthy();
  } finally {
    app.dom.window.close();
  }
});

test('original hover can be disabled while click and keyboard previews stay available', () => {
  const app = setup();
  try {
    const message = required(app.w.testAdapter.messages()[0]);
    app.w.testUI.reading(message, 'Hello', { hoverOriginal: false });
    const original = element<HTMLButtonElement>(app.w.document, '.wisp-original-button');
    original.dispatchEvent(new app.w.Event('mouseenter'));
    expect(original.getAttribute('aria-expanded')).toBe('false');
    original.click();
    expect(original.getAttribute('aria-expanded')).toBe('true');
    original.click();
    expect(original.getAttribute('aria-expanded')).toBe('false');
    original.focus();
    expect(original.getAttribute('aria-expanded')).toBe('true');
  } finally {
    app.dom.window.close();
  }
});

test('focused layout expands deep panes, hides inner edge strips, and notifies native page layout once', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main'),
      shell = app.w.document.createElement('section');
    main.replaceWith(shell);
    shell.innerHTML = '<aside><div id="pane-side">Chats</div></aside>';
    shell.append(main);
    const pane = app.w.document.createElement('section');
    pane.innerHTML =
      '<div><div><div id="deep"><span id="edge"></span><div id="rows"></div></div></div></div>';
    element(main, '[data-id]').replaceWith(pane);
    element(pane, '#rows').append(app.w.document.createElement('div'));
    const bounds = rect({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 });
    main.getBoundingClientRect = () => bounds;
    for (const node of pane.querySelectorAll('div')) node.getBoundingClientRect = () => bounds;
    pane.getBoundingClientRect = () => bounds;
    const edge = element(pane, '#edge');
    edge.getBoundingClientRect = () => rect({ ...bounds, width: 1, right: 1 });
    let resizes = 0;
    app.w.addEventListener('resize', () => resizes++);
    app.w.testLayout.configure(true);
    expect(element(main, 'header').classList.contains('wisp-focus-stretch')).toBeTruthy();
    expect(element(pane, '#deep').classList.contains('wisp-focus-stretch')).toBeTruthy();
    expect(edge.classList.contains('wisp-focus-hidden')).toBeTruthy();
    await app.advance(35);
    expect(resizes).toBe(1);
    for (let i = 0; i < 10; i++) app.w.testLayout.refresh();
    await app.advance(35);
    expect(resizes).toBe(1);
    const report = app.w.testLayout.diagnostics();
    expect(JSON.parse(report).focused).toBe(true);
    expect(
      !report.includes('Contact') &&
        !report.includes('See you soon') &&
        !report.includes('123@lid'),
    ).toBeTruthy();
    app.w.testLayout.configure(false);
    await app.advance(35);
    expect(resizes).toBe(2);
    expect(main.querySelectorAll('[class*="wisp-focus"]').length).toBe(0);
  } finally {
    app.dom.window.close();
  }
});

test('layout diagnostics include wallpaper siblings without exposing page text, identifiers or image URLs', () => {
  const app = setup();
  try {
    const wallpaper = app.w.document.createElement('div');
    wallpaper.style.backgroundImage = 'url("https://example.invalid/private-chat-wallpaper.png")';
    wallpaper.textContent = 'private contact name';
    app.w.document.body.append(wallpaper);
    const raw = app.w.testLayout.diagnostics(),
      report = JSON.parse(raw) as {
        main: boolean;
        nodes: { background?: { id: number }; path: string }[];
      };
    expect(report.main).toBe(true);
    const layer = required(report.nodes.find((node) => node.background));
    expect(required(layer.background).id && layer.path).toBeTruthy();
    for (const privateValue of [
      'private contact name',
      'private-chat-wallpaper',
      '123@lid',
      'See you soon',
    ])
      expect(!raw.includes(privateValue)).toBeTruthy();
    element(app.w.document, '#main').remove();
    expect(JSON.parse(app.w.testLayout.diagnostics()).main).toBe(false);
  } finally {
    app.dom.window.close();
  }
});

test('focus clears the parallel painted split from the real layout capture without resizing wallpaper or touching controls', () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main'),
      shell = app.w.document.createElement('section');
    main.replaceWith(shell);
    shell.innerHTML =
      '<aside><div id="pane-side">Chats</div></aside><div id="paint" style="position:absolute;inset:0;display:flex"><div id="left-paint" style="border-left:1px solid red;width:512px"><span><svg><title>Wallpaper</title></svg></span></div><div id="right-paint" style="border-left:1px solid red;width:704px"><span></span></div></div><div id="control-layer" style="position:absolute"><button style="border-left:1px solid green">Menu</button></div><div id="text-layer" style="position:absolute">Status text</div>';
    shell.append(main);
    const bounds = rect({ left: 0, top: 0, right: 1280, bottom: 770, width: 1280, height: 770 });
    main.getBoundingClientRect = () => bounds;
    const paint = element(shell, '#paint'),
      left = element(shell, '#left-paint'),
      right = element(shell, '#right-paint');
    paint.getBoundingClientRect = () => bounds;
    left.getBoundingClientRect = () => rect({ ...bounds, left: 64, right: 576, width: 512 });
    right.getBoundingClientRect = () => rect({ ...bounds, left: 576, right: 1280, width: 704 });
    for (const node of shell.querySelectorAll('#control-layer, #control-layer button, #text-layer'))
      node.getBoundingClientRect = () => bounds;
    app.w.testLayout.configure(true);
    for (const node of [paint, left, right]) {
      expect(node.classList.contains('wisp-focus-edges')).toBeTruthy();
      expect(!node.classList.contains('wisp-focus-stretch')).toBeTruthy();
      expect(!node.classList.contains('wisp-focus-hidden')).toBeTruthy();
    }
    expect(left.style.width).toBe('512px');
    expect(right.style.width).toBe('704px');
    expect(
      shell.querySelectorAll(
        '#control-layer [class*="wisp-focus"], #control-layer[class*="wisp-focus"], #text-layer[class*="wisp-focus"]',
      ).length,
    ).toBe(0);
    for (let i = 0; i < 5; i++) app.w.testLayout.refresh();
    expect(left.classList.contains('wisp-focus-edges')).toBeTruthy();
    app.w.testLayout.configure(false);
    expect(shell.querySelectorAll('[class*="wisp-focus"]').length).toBe(0);
    expect(left.style.borderLeftWidth).toBe('1px');
    expect(right.style.borderLeftWidth).toBe('1px');
  } finally {
    app.dom.window.close();
  }
});
