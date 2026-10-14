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

test('modern chat titles work and detection explains missing or ambiguous history', () => {
  const { dom, w } = setup();
  try {
    element(w.document, 'header').innerHTML =
      '<span data-testid="conversation-info-header-chat-title">Contact</span>';
    expect(w.testAdapter.active().title).toBe('Contact');
    element(w.document, '[data-id]').remove();
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
