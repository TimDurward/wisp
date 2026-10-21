import { test, expect } from 'vitest';
import { setup } from './support/harness';
import { element, required } from './support/fixtures';

const first = '3EB0A123456789ABCDEF0123456789AB';
const second = '3EB0B123456789ABCDEF0123456789AB';

function opaqueChat() {
  const app = setup();
  element(app.w.document, '[data-id]').dataset.id = first;
  app.w.document.body.insertAdjacentHTML(
    'beforeend',
    '<aside id="pane-side"><button aria-selected="true">Contact</button></aside>',
  );
  app.start();
  return app;
}

test('overlapping messages retain their chat through header, sidebar and panel rerenders', async () => {
  const app = opaqueChat();
  try {
    const original = required(app.requests('active_conversation').at(-1));
    app.emit({ type: 'config', conversation: 'chat:original', revision: 1, enabled: true });
    await app.flush();
    const reading = required(app.requests('translate').at(-1));
    app.emit({
      type: 'translation',
      conversation: reading.conversation,
      request_id: reading.request_id,
      text: 'Hello',
    });
    for (const selector of ['header', '[aria-selected]', '#main']) {
      const previous = element(app.w.document, selector);
      previous.replaceWith(previous.cloneNode(true));
    }
    await app.flush();
    expect(required(app.w.__wispChatRepair)(original.view_id)).not.toBeNull();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    expect(app.requests('translate').at(-1)?.purpose).toBe('reply');
    element(app.w.document, 'footer').insertAdjacentHTML(
      'beforebegin',
      `<div data-id="${second}"><div class="message-in"><span class="selectable-text">Más historia</span></div></div>`,
    );
    await app.flush();
    const next = required(app.requests('active_conversation').at(-1));
    expect(next.view_id).toBe(original.view_id);
    expect(Array.from(next.message_ids)).toEqual([first, second]);
    expect(
      app.requests('translate').find((request) => request.message_id === second)?.conversation,
    ).toBe('chat:original');
  } finally {
    app.dom.window.close();
  }
});

test('navigation cannot use lingering old messages to bridge a same-name header replacement', async () => {
  const app = opaqueChat();
  try {
    const original = required(app.requests('active_conversation').at(-1));
    app.emit({ type: 'config', conversation: 'chat:original', revision: 1, enabled: true });
    await app.flush();
    element(app.w.document, '[aria-selected]').dispatchEvent(
      new app.w.MouseEvent('pointerdown', { bubbles: true }),
    );
    const header = element(app.w.document, 'header');
    header.replaceWith(header.cloneNode(true));
    await app.flush();
    const navigating = required(app.requests('active_conversation').at(-1));
    expect(navigating.view_id).not.toBe(original.view_id);
    expect(app.w.document.querySelector('.wisp-preview-button')).toBeNull();
    element(app.w.document, '[data-id]').dataset.id = second;
    await app.flush();
    expect(required(app.requests('active_conversation').at(-1)).view_id).not.toBe(
      navigating.view_id,
    );
  } finally {
    app.dom.window.close();
  }
});

test('same-name navigation through an empty recycled panel never inherits the previous chat', async () => {
  const app = opaqueChat();
  try {
    const original = required(app.requests('active_conversation').at(-1));
    app.emit({ type: 'config', conversation: 'chat:original', revision: 1, enabled: true });
    await app.flush();
    element(app.w.document, '[aria-selected]').dispatchEvent(
      new app.w.MouseEvent('pointerdown', { bubbles: true }),
    );
    const message = element(app.w.document, '[data-id]');
    message.remove();
    await app.flush();
    const empty = required(app.requests('active_conversation').at(-1));
    expect(empty.detection).toBe('empty');
    expect(empty.view_id).not.toBe(original.view_id);
    expect(app.w.document.querySelector('.wisp-preview-button')).toBeNull();
    message.dataset.id = second;
    element(app.w.document, 'footer').before(message);
    await app.flush();
    expect(required(app.requests('active_conversation').at(-1)).view_id).not.toBe(original.view_id);
    expect(app.requests('translate').every((request) => request.message_id !== second)).toBe(true);
  } finally {
    app.dom.window.close();
  }
});

test('a synthetic history gesture cannot join disjoint opaque records', async () => {
  const app = opaqueChat();
  try {
    const original = required(app.requests('active_conversation').at(-1));
    element(app.w.document, '[data-id]').dispatchEvent(
      new app.w.WheelEvent('wheel', { bubbles: true, deltaY: -400 }),
    );
    element(app.w.document, '[data-id]').dataset.id = second;
    await app.flush();
    expect(required(app.requests('active_conversation').at(-1)).view_id).not.toBe(original.view_id);
  } finally {
    app.dom.window.close();
  }
});

test('native repair confirms fresh message IDs and refuses stale or changed views', async () => {
  const app = opaqueChat();
  try {
    const view = required(app.requests('active_conversation').at(-1)).view_id;
    const repair = required(app.w.__wispChatRepair);
    expect(repair(view)).toEqual({ view_id: view, message_ids: [first] });
    expect(repair('stale-view')).toBeNull();
    element(app.w.document, '[data-id]').dataset.id = second;
    expect(repair(view)).toBeNull();
    element(app.w.document, '[data-id]').dataset.id = first;
    expect(repair(view)).not.toBeNull();
    element(app.w.document, 'header [title]').setAttribute('title', 'Different contact');
    expect(repair(view)).toBeNull();
    element(app.w.document, 'header [title]').setAttribute('title', 'Contact');
    element(app.w.document, '[aria-selected]').dispatchEvent(
      new app.w.MouseEvent('pointerdown', { bubbles: true }),
    );
    expect(repair(view)).toBeNull();
  } finally {
    app.dom.window.close();
  }
  expect(app.w.__wispChatRepair).toBeUndefined();
});

test('native repair refuses empty and unsupported message panels', () => {
  const app = opaqueChat();
  try {
    const view = required(app.requests('active_conversation').at(-1)).view_id;
    const repair = required(app.w.__wispChatRepair);
    element(app.w.document, '[data-id]').dataset.id = 'unrecognized';
    expect(repair(view)).toBeNull();
    element(app.w.document, '[data-id]').remove();
    expect(repair(view)).toBeNull();
  } finally {
    app.dom.window.close();
  }
});
