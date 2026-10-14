import { element, required } from './support/fixtures';
import { test, expect } from 'vitest';
import { setup } from './support/harness';

test('link-only messages keep native previews without requesting a translation', async () => {
  const app = setup();
  try {
    element(app.w.document, '.selectable-text').textContent =
      'https://example.com/ExactPath?q=1#here';
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    expect(app.requests('translate').length).toBe(0);
    expect(app.w.document.querySelector('.wisp-inline')).toBeNull();
  } finally {
    app.dom.window.close();
  }
});

for (const completed of [false, true]) {
  test(`editing a translated message to a URL removes stale translation UI (completed=${completed})`, async () => {
    const app = setup();
    try {
      app.start();
      app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
      await app.flush();
      const request = required(
        app.requests('translate').find((value) => value.purpose === 'reading'),
      );
      if (completed)
        app.emit({
          type: 'translation',
          conversation: request.conversation,
          request_id: request.request_id,
          text: 'Hello',
        });
      const source = element(app.w.document, '.selectable-text');
      source.textContent = 'https://example.com/ExactPath';
      await app.flush();
      app.emit({
        type: 'translation',
        conversation: request.conversation,
        request_id: request.request_id,
        text: 'Stale result',
      });
      expect(app.w.document.querySelector('.wisp-inline')).toBeNull();
      expect(source.classList.contains('wisp-original-text')).toBe(false);
      expect(app.requests('translate').filter((value) => value.purpose === 'reading').length).toBe(
        1,
      );
    } finally {
      app.dom.window.close();
    }
  });
}

test('unknown or conflicting chat identities fail closed', () => {
  const { dom, w } = setup();
  try {
    const extra = w.document.createElement('div');
    extra.dataset.id = 'false_456@lid_TWO';
    extra.innerHTML =
      '<div class="message-in"><span class="selectable-text copyable-text">Hola</span></div>';
    element(w.document, '#main').append(extra);
    expect(w.testAdapter.active().conversation).toBe('');
    extra.remove();
    element(w.document, '[data-id]').dataset.id = 'unknown-format';
    expect(w.testAdapter.active().conversation).toBe('');
    expect(w.testAdapter.active().detection).toBe('unsupported_messages');
  } finally {
    dom.window.close();
  }
});

test('an empty chat translates a first draft and retains its view when the first message arrives', async () => {
  const app = setup();
  try {
    element(app.w.document, '[data-id]').remove();
    app.start();
    await app.flush();
    const empty = required(app.requests('active_conversation').at(-1));
    expect(empty.detection).toBe('empty');
    app.emit({ type: 'config', conversation: 'chat:empty', revision: 1, enabled: true });
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const draft = required(app.requests('translate').at(-1));
    expect(draft.purpose).toBe('reply');
    expect(draft.conversation).toBe('chat:empty');
    expect(Array.from(draft.context)).toEqual([]);
    element(app.w.document, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="true_123@lid_FIRST"><div class="message-out"><span class="selectable-text">Hello</span></div></div>',
    );
    await app.flush();
    const firstMessage = required(app.requests('active_conversation').at(-1));
    expect(firstMessage.detection).toBe('ready');
    expect(firstMessage.view_id).toBe(empty.view_id);
    expect(app.w.document.querySelector('.wisp-preview-button')).not.toBeNull();
  } finally {
    app.dom.window.close();
  }
});

test('navigation between empty same-name chats resets enablement even when WhatsApp reuses markup', async () => {
  const app = setup();
  try {
    element(app.w.document, '[data-id]').remove();
    app.start();
    await app.flush();
    const empty = required(app.requests('active_conversation').at(-1));
    app.emit({ type: 'config', conversation: 'chat:first-empty', revision: 1, enabled: true });
    await app.flush();
    const row = app.w.document.createElement('button');
    row.textContent = 'Contact';
    app.w.document.body.append(row);
    row.dispatchEvent(new app.w.MouseEvent('pointerdown', { bubbles: true }));
    await app.flush();
    const next = required(app.requests('active_conversation').at(-1));
    expect(next.view_id).not.toBe(empty.view_id);
    expect(app.w.document.querySelector('.wisp-preview-button')).toBeNull();
    app.emit({
      type: 'config',
      conversation: 'chat:first-empty',
      view_id: empty.view_id,
      revision: 2,
      enabled: true,
    });
    expect(app.w.document.querySelector('.wisp-preview-button')).toBeNull();
  } finally {
    app.dom.window.close();
  }
});

test('modern opaque message IDs and plain selectable spans are recognized', () => {
  const { dom, w } = setup();
  try {
    element(w.document, '[data-id]').dataset.id = '3EB0A123456789ABCDEF0123456789AB';
    element(w.document, '.selectable-text').className = 'selectable-text';
    const active = w.testAdapter.active();
    expect(active.conversation).toBe(''); // Rust assigns identity from these records.
    expect(active.detection).toBe('ready');
    expect(active.messageIds.length).toBe(1);
    expect(required(w.testAdapter.messages()[0]).direction).toBe('incoming');
    expect(required(w.testAdapter.messages()[0]).text).toBe('Hola\n¿Vienes? 😊');
  } finally {
    dom.window.close();
  }
});

test('enabling a modern chat translates existing history and older records revealed by scrolling', async () => {
  const app = setup();
  try {
    const first = '3EB0A123456789ABCDEF0123456789AB';
    element(app.w.document, '[data-id]').dataset.id = first;
    app.start();
    await app.flush();
    const observation = required(app.requests('active_conversation').at(-1));
    expect(observation.detection).toBe('ready');
    expect(Array.from(observation.message_ids)).toEqual([first]);
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(0);
    app.emit({ type: 'config', conversation: 'chat:native-identity', revision: 1, enabled: true });
    await app.flush();
    const request = required(app.sent.find((v) => v.type === 'translate'));
    expect(request).toBeTruthy();
    expect(request.conversation).toBe('chat:native-identity');
    expect(request.message_id).toBe(first);
    app.emit({
      type: 'translation',
      conversation: request.conversation,
      request_id: request.request_id,
      text: 'Hello',
    });
    expect(element(app.w.document, '.wisp-inline')).toBeTruthy();
    const older = app.w.document.createElement('div');
    older.dataset.id = '3EB0B123456789ABCDEF0123456789AB';
    older.innerHTML =
      '<div class="message-in"><span class="selectable-text">Hasta mañana.</span></div>';
    element(app.w.document, '[data-id]').before(older);
    app.w.document.dispatchEvent(new app.w.Event('scroll', { bubbles: true }));
    await app.flush();
    const next = required(app.requests('translate').find((v) => v.text === 'Hasta mañana.'));
    expect(next).toBeTruthy();
    expect(next.conversation).toBe('chat:native-identity');
    expect(app.sent.filter((v) => v.type === 'translate' && v.message_id === first).length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});

test('same-name chats and stale config events never inherit the previous open view', async () => {
  const app = setup();
  try {
    element(app.w.document, '[data-id]').dataset.id = '3EB0A123456789ABCDEF0123456789AB';
    app.start();
    await app.flush();
    const firstView = required(app.requests('active_conversation').at(-1)).view_id;
    app.emit({ type: 'config', conversation: 'chat:first', revision: 1, enabled: true });
    await app.flush();
    const oldRequest = required(app.sent.find((v) => v.type === 'translate'));
    element(app.w.document, '[data-id]').dataset.id = '3EB0B123456789ABCDEF0123456789AB';
    await app.flush();
    expect(required(app.requests('active_conversation').at(-1)).view_id).not.toBe(firstView);
    app.emit({
      type: 'config',
      conversation: 'chat:first',
      view_id: firstView,
      revision: 2,
      enabled: true,
    });
    app.emit({
      type: 'translation',
      conversation: 'chat:first',
      request_id: oldRequest.request_id,
      text: 'Wrong chat',
    });
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});

test('channel waits for native enablement and discards results after disabling', async () => {
  const app = setup();
  try {
    app.start();
    await app.flush();
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(0);
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const request = required(app.sent.find((v) => v.type === 'translate'));
    expect(request).toBeTruthy();
    expect(request.text).toBe('Hola\n¿Vienes? 😊');
    app.emit({ type: 'config', conversation: '123@lid', revision: 2, enabled: false });
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: request.request_id,
      text: 'Hello',
    });
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('virtualized history restores finished translations without another inference request', async () => {
  const app = setup();
  try {
    app.start();
    await app.flush();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const request = required(app.sent.find((v) => v.type === 'translate'));
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: request.request_id,
      text: 'Hello, are you coming? 😊',
    });
    const record = element(app.w.document, '[data-id]');
    // WhatsApp replaces rendered rows as the viewport moves.
    const replacement = record.cloneNode(true) as HTMLElement;
    element(replacement, '.wisp-inline').remove();
    record.replaceWith(replacement);
    await app.flush();
    expect(
      element(replacement, '.wisp-inline').textContent.includes('Hello, are you coming? 😊'),
    ).toBeTruthy();
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(1);
    // A rule/model revision preserves saved reading and invalidates draft tickets.
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 2,
      enabled: true,
      has_rules: true,
    });
    await app.flush();
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(1);
    expect(
      element<HTMLButtonElement>(app.w.document, '.wisp-prepare').title.includes(
        'Translation rules applied',
      ),
    ).toBeTruthy();
    expect(app.w.document.querySelector('.wisp-composer-top')).toBe(null);
    expect(
      element(replacement, '.wisp-inline').textContent.includes('Hello, are you coming? 😊'),
    ).toBeTruthy();
  } finally {
    app.dom.window.close();
  }
});

test('failed history translations keep a usable retry after their row is replaced', async () => {
  const app = setup();
  try {
    app.start();
    await app.flush();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const request = required(app.sent.find((v) => v.type === 'translate'));
    app.emit({
      type: 'translation_error',
      conversation: '123@lid',
      request_id: request.request_id,
      message: 'Try again shortly',
    });
    const record = element(app.w.document, '[data-id]'),
      replacement = record.cloneNode(true) as HTMLElement;
    element(replacement, '.wisp-inline').remove();
    record.replaceWith(replacement);
    await app.flush();
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(1);
    const retry = element<HTMLButtonElement>(replacement, '.wisp-inline button');
    expect(retry).toBeTruthy();
    retry.click();
    await app.flush();
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(2);
  } finally {
    app.dom.window.close();
  }
});

test('old chat replies cannot appear in the newly selected conversation', async () => {
  const app = setup();
  try {
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const old = required(app.sent.find((v) => v.type === 'translate'));
    element(app.w.document, '[data-id]').dataset.id = 'false_789@lid_NEXT';
    element(app.w.document, 'header [title]').title = 'Another contact';
    await app.flush();
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: old.request_id,
      text: 'Old conversation text',
    });
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
    expect(required(app.requests('active_conversation').at(-1)).conversation).toBe('789@lid');
  } finally {
    app.dom.window.close();
  }
});

test('sent messages translate for reading and display preferences reuse completed output', async () => {
  const app = setup();
  try {
    const row = app.w.document.createElement('div');
    row.dataset.id = 'true_123@lid_SENT';
    row.innerHTML =
      '<div class="message-out"><span class="selectable-text">Hasta mañana</span></div>';
    element(app.w.document, 'footer').before(row);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const first = required(app.sent.find((v) => v.type === 'translate'));
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: first.request_id,
      text: 'Hello',
    });
    const sent = required(app.requests('translate').find((v) => v.message_id === row.dataset.id));
    expect(sent.purpose).toBe('reading');
    expect(sent.direction).toBe('outgoing');
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: sent.request_id,
      text: 'See you tomorrow',
    });
    expect(element(row, '.wisp-original-text')).toBeTruthy();
    const original = element<HTMLButtonElement>(row, '.wisp-original-button');
    original.focus();
    original.click();
    expect(original.getAttribute('aria-expanded')).toBe('true');
    expect(
      element(app.w.document, '.wisp-original-popup').textContent.includes('Hasta mañana'),
    ).toBeTruthy();
    original.dispatchEvent(new app.w.Event('mouseleave'));
    expect(original.getAttribute('aria-expanded')).toBe('true');
    original.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(original.getAttribute('aria-expanded')).toBe('false');
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      view_preferences: { reading_view: 'both_languages', live_preview: false },
    });
    await app.flush();
    expect(row.querySelector('.wisp-original-text')).toBe(null);
    expect(element(row, '.wisp-inline')).toBeTruthy();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      view_preferences: { include_sent: false, live_preview: false },
    });
    await app.flush();
    expect(row.querySelector('.wisp-inline')).toBe(null);
    expect(app.sent.filter((v) => v.type === 'translate').length).toBe(2);
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: false });
    expect(app.w.document.querySelector('.wisp-original-text')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('a refused native edit keeps English and provides a usable copy fallback', async () => {
  const app = setup();
  try {
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
    expect(element<HTMLButtonElement>(app.w.document, '.wisp-prepare').disabled).toBe(true);
    app.commitEdit({ accepted: false });
    expect(app.w.testAdapter.draft()).toBe('See you soon');
    expect(element<HTMLButtonElement>(app.w.document, '.wisp-prepare').disabled).toBe(false);
    expect(
      element(app.w.document, '.wisp-draft-status').textContent.toLowerCase().includes('copy'),
    ).toBeTruthy();
    app.prepare();
    app.commitEdit();
    expect(app.w.testAdapter.draft()).toBe('Nos vemos pronto');
  } finally {
    app.dom.window.close();
  }
});

test('saved messages restore locally before inference and remain available without AI access', async () => {
  const saved = new Map([['false_123@lid_ONE', 'Hello, are you coming? 😊']]);
  const app = setup({ saved });
  try {
    app.start();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      can_translate: false,
    });
    await app.flush();
    expect(
      element(app.w.document, '.wisp-translation-text').textContent.includes('Hello'),
    ).toBeTruthy();
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
    expect(app.w.document.querySelector('.wisp-composer')).toBe(null);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 2,
      enabled: false,
      can_translate: false,
    });
    await app.flush();
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 3,
      enabled: true,
      can_translate: false,
    });
    await app.flush();
    expect(element(app.w.document, '.wisp-inline')).toBeTruthy();
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
  } finally {
    app.dom.window.close();
  }
});

test('stale hydration cannot restore old text after a policy clear or conversation change', async () => {
  const app = setup({ autoHydrate: false });
  try {
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const old = required(app.sent.find((value) => value.type === 'saved_messages'));
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 2,
      enabled: true,
      history_revision: 1,
    });
    app.emit({
      type: 'saved_messages',
      conversation: old.conversation,
      view_id: old.view_id,
      request_id: old.request_id,
      items: [{ message_id: 'false_123@lid_ONE', text: 'Stale' }],
    });
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
    await app.flush();
    const current = required(app.sent.findLast((value) => value.type === 'saved_messages'));
    element(app.w.document, '[data-id]').dataset.id = 'false_456@lid_OTHER';
    await app.flush();
    app.emit({
      type: 'saved_messages',
      conversation: current.conversation,
      view_id: current.view_id,
      request_id: current.request_id,
      items: [{ message_id: 'false_123@lid_ONE', text: 'Other chat' }],
    });
    expect(app.w.document.querySelector('.wisp-inline')).toBe(null);
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
  } finally {
    app.dom.window.close();
  }
});

test('connecting AI later translates local misses without repeating restored messages', async () => {
  const app = setup();
  try {
    app.start();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      can_translate: false,
    });
    await app.flush();
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 2,
      enabled: true,
      can_translate: true,
    });
    await app.flush();
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(1);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 3,
      enabled: true,
      can_translate: false,
    });
    await app.flush();
    expect(app.w.document.querySelector('.wisp-loading')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('bounded reading memory restores saved rows after out-of-order completions', async () => {
  const saved = new Map();
  for (let i = 1; i < 530; i++) saved.set(`false_123@lid_HISTORY${i}`, `Translation ${i}`);
  const app = setup({ saved });
  try {
    const history = app.w.document.createElement('section'),
      main = element(app.w.document, '#main');
    element(app.w.document, '[data-id]').replaceWith(history);
    function page(start: number, end: number) {
      history.innerHTML = Array.from(
        { length: end - start },
        (_, offset) =>
          `<div data-id="false_123@lid_HISTORY${start + offset}"><div class="message-in"><span class="selectable-text">Hola ${start + offset}</span></div></div>`,
      ).join('');
    }
    page(0, 64);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.advance(1000);
    const first = required(app.sent.find((value) => value.type === 'translate'));
    expect(first.message_id).toBe('false_123@lid_HISTORY0');
    // Local hits finish before the one outstanding AI request.
    expect(history.querySelectorAll('.wisp-inline:not(.wisp-loading)').length).toBe(63);
    app.emit({
      type: 'translation',
      conversation: first.conversation,
      request_id: first.request_id,
      text: 'Translation 0',
    });
    for (let start = 64; start < 530; start += 64) {
      page(start, Math.min(530, start + 64));
      main.dispatchEvent(new app.w.Event('scroll'));
      await app.advance(1000);
    }
    page(18, 19);
    main.dispatchEvent(new app.w.Event('scroll'));
    await app.flush();
    expect(element(history, '.wisp-translation-text')?.textContent).toBe('Translation 18');
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});
