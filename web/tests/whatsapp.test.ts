import { required, element, rect } from './support/fixtures';
import { test, expect } from 'vitest';
import { setup } from './support/harness';

test('adapter preserves emojis and breaks while keeping translated UI out of context', () => {
  const { dom, w } = setup();
  try {
    const messages = w.testAdapter.messages();
    expect(messages.length).toBe(1);
    expect(required(messages[0]).text).toBe('Hola\n¿Vienes? 😊');
    w.testUI.reading(required(messages[0]), 'Hello');
    expect(required(w.testAdapter.messages()[0]).text).toBe(required(messages[0]).text);
    expect(w.testAdapter.active().conversation).toBe('123@lid');
  } finally {
    dom.window.close();
  }
});

test('reading source text skips hidden and translated subtrees without changing the DOM', () => {
  const { dom, w } = setup();
  try {
    const source = element(w.document, '.selectable-text');
    source.innerHTML =
      'Hola<img alt="😊" aria-hidden="true"><span aria-hidden="true">Hidden</span><span data-wisp="reading">Translated<img alt="No"></span><br>Uno<p>Dos</p><div>Tres</div>';
    const original = source.innerHTML;
    expect(w.testAdapter.textOf(source)).toBe('Hola😊\nUno\nDos\nTres');
    expect(source.innerHTML).toBe(original);
  } finally {
    dom.window.close();
  }
});

test('targeted history reads preserve eight preceding text messages across media rows', () => {
  const { dom, w } = setup();
  try {
    const main = element(w.document, '#main');
    main.querySelector('[data-id]')!.remove();
    const ids: string[] = [];
    for (let index = 0; index < 30; index++) {
      const id = `false_123@lid_ROW${index}`;
      if (index % 3) ids.push(id);
      main.insertAdjacentHTML(
        'beforeend',
        `<div data-id="${id}"><div class="message-in">${index % 3 ? `<span class="selectable-text">Message ${index}</span>` : '<button>Voice note</button>'}</div></div>`,
      );
    }
    const target = 'false_123@lid_ROW25';
    const items = w.testAdapter.messages(main, new Set([target]), 8);
    const position = ids.indexOf(target);
    expect(items.map((item) => item.id)).toEqual(ids.slice(position - 8, position + 1));
    expect(w.testAdapter.context(items, target)).toHaveLength(8);
    expect(w.testAdapter.messages(main, new Set([target])).map((item) => item.id)).toEqual([
      target,
    ]);
    element(main, `[data-id="${target}"] .selectable-text`).textContent = 'Edited';
    expect(w.testAdapter.messages(main, new Set([target]))[0]?.text).toBe('Edited');
  } finally {
    dom.window.close();
  }
});

test('media-only chats can be enabled without depending on text or header titles', () => {
  const { dom, w } = setup();
  try {
    element(w.document, 'header').innerHTML = '<button>Contact</button>';
    element(w.document, '.message-in').innerHTML = '<img alt="Sticker">';
    const active = w.testAdapter.active();
    expect(active.conversation).toBe('123@lid');
    expect(active.detection).toBe('ready');
    expect(active.title).toBe('Current chat');
    expect(w.testAdapter.messages().length).toBe(0);
  } finally {
    dom.window.close();
  }
});

test('empty chats are usable even with selectable system notices, while incomplete views wait', () => {
  const { dom, w } = setup();
  try {
    element(w.document, 'header').innerHTML =
      '<span data-testid="conversation-info-header-chat-title">Contact</span>';
    expect(w.testAdapter.active().title).toBe('Contact');
    element(w.document, '[data-id]').remove();
    element(w.document, 'header span').setAttribute('data-id', 'contact-info');
    element(w.document, 'header').insertAdjacentHTML(
      'afterend',
      '<span class="selectable-text">Messages are end-to-end encrypted</span>',
    );
    expect(w.testAdapter.active().detection).toBe('empty');
    expect(w.testAdapter.active().messageIds.length).toBe(0);
    element(w.document, 'footer').remove();
    expect(w.testAdapter.active().detection).toBe('waiting_for_messages');
    element(w.document, '#main').remove();
    expect(w.testAdapter.active().detection).toBe('no_chat');
  } finally {
    dom.window.close();
  }
});

test('modern bubbles without direction classes use clear alignment and skip ambiguous rows', () => {
  const { dom, w } = setup();
  try {
    const main = element(w.document, '#main');
    const record = element(main, '[data-id]');
    const bubble = element(record, '.message-in');
    record.dataset.id = '3EB0A123456789ABCDEF0123456789AB';
    bubble.className = '';
    bubble.dataset.prePlainText = '[time] Contact:';
    main.getBoundingClientRect = () => rect({ left: 0, right: 700, width: 700 });
    bubble.getBoundingClientRect = () => rect({ left: 50, right: 400, width: 350 });
    expect(required(w.testAdapter.messages()[0]).direction).toBe('incoming');
    bubble.getBoundingClientRect = () => rect({ left: 300, right: 650, width: 350 });
    expect(required(w.testAdapter.messages()[0]).direction).toBe('outgoing');
    bubble.getBoundingClientRect = () => rect({ left: 100, right: 600, width: 500 });
    expect(w.testAdapter.messages().length).toBe(0);
  } finally {
    dom.window.close();
  }
});
