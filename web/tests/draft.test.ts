import { element, required } from './support/fixtures';
import { test, expect } from 'vitest';
import { setup } from './support/harness';

test('outgoing previews neither replace the draft nor send it', async () => {
  const app = setup();
  try {
    let sends = 0;
    element<HTMLButtonElement>(app.w.document, '#send').addEventListener('click', () => sends++);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const incoming = required(app.sent.find((v) => v.type === 'translate'));
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: incoming.request_id,
      text: 'Hello',
    });
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const outgoing = required(app.requests('translate').find((v) => v.direction === 'outgoing'));
    expect(outgoing).toBeTruthy();
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: outgoing.request_id,
      text: 'Nos vemos pronto',
    });
    expect(element(app.w.document, '.wisp-preview-text').textContent).toBe('Nos vemos pronto');
    expect(app.w.testAdapter.draft()).toBe('See you soon');
    expect(sends).toBe(0);
    const composer = element(app.w.document, '[contenteditable]');
    composer.textContent = 'A different draft';
    composer.dispatchEvent(new app.w.Event('input', { bubbles: true }));
    expect(element<HTMLButtonElement>(app.w.document, '.wisp-prepare').disabled).toBe(true);
  } finally {
    app.dom.window.close();
  }
});

test('fallback chat panels keep one preview composer when the DOM changes', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main');
    main.removeAttribute('id');
    main.dataset.testid = 'conversation-panel-wrapper';
    app.start();
    await app.flush();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    for (let n = 0; n < 3; n++) {
      const extra = app.w.document.createElement('p');
      extra.textContent = 'History changed';
      element(main, 'footer').before(extra);
      await app.flush();
    }
    expect(app.w.document.querySelectorAll('.wisp-composer').length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});

test('composer discovery works without a footer and fails closed for multiple editors', async () => {
  const app = setup();
  try {
    const footer = element(app.w.document, 'footer'),
      modern = app.w.document.createElement('div');
    modern.innerHTML = footer.innerHTML;
    footer.replaceWith(modern);
    expect(required(app.w.testAdapter.composer()).panel).toBe(modern);
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    expect(app.w.document.querySelectorAll('.wisp-composer').length).toBe(1);
    expect(element(app.w.document, '.wisp-composer').parentElement).toBe(app.w.document.body);
    const another = app.w.document.createElement('div');
    another.setAttribute('role', 'textbox');
    another.setAttribute('contenteditable', 'true');
    modern.append(another);
    await app.flush();
    expect(app.w.testAdapter.composer()).toBe(null);
    expect(app.w.document.querySelector('.wisp-composer')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('changed drafts cancel old work and reject stale progress or completion', async () => {
  const app = setup();
  try {
    const input = element(app.w.document, '[contenteditable]');
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const old = required(app.requests('translate').find((v) => v.purpose === 'reply'));
    input.textContent = 'A new reply';
    input.dispatchEvent(new app.w.Event('input', { bubbles: true }));
    expect(
      required(
        app.sent.find((v) => v.type === 'cancel_translation' && v.request_id === old.request_id),
      ),
    ).toBeTruthy();
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: old.request_id,
      text: 'Texto viejo',
    });
    expect(element<HTMLButtonElement>(app.w.document, '.wisp-prepare').disabled).toBe(true);
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const next = required(app.requests('translate').findLast((v) => v.purpose === 'reply'));
    app.emit({
      type: 'translation',
      conversation: '123@lid',
      request_id: next.request_id,
      text: 'Una nueva respuesta',
    });
    // A switch before the debounced DOM scan must still prevent preparing in a different chat.
    element(app.w.document, 'header [title]').title = 'Another contact';
    app.prepare();
    expect(app.w.testAdapter.draft()).toBe('A new reply');
  } finally {
    app.dom.window.close();
  }
});

test('live previews coalesce typing, respect IME, and stop after translation is disabled', async () => {
  const app = setup();
  try {
    const input = element(app.w.document, '[contenteditable]');
    input.textContent = '';
    app.start();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      view_preferences: { live_preview: true },
    });
    await app.flush();
    for (const text of ['H', 'Hi', 'Hi there']) {
      input.textContent = text;
      input.dispatchEvent(new app.w.Event('input', { bubbles: true }));
    }
    await app.advance(1000);
    expect(app.sent.filter((v) => v.type === 'translate' && v.purpose === 'reply').length).toBe(1);
    expect(required(app.requests('translate').find((v) => v.purpose === 'reply')).text).toBe(
      'Hi there',
    );
    input.textContent = 'Composing';
    app.dispatchInput('input', input, { isComposing: true });
    await app.advance(1000);
    expect(app.sent.filter((v) => v.type === 'translate' && v.purpose === 'reply').length).toBe(1);
    app.dispatchInput('compositionend', input);
    app.emit({ type: 'config', conversation: '123@lid', revision: 2, enabled: false });
    await app.advance(1000);
    expect(app.sent.filter((v) => v.type === 'translate' && v.purpose === 'reply').length).toBe(1);
    expect(app.w.testAdapter.draft()).toBe('Composing');
    expect(app.w.document.querySelector('.wisp-composer')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('cancelling an IME composition without editing leaves the preview usable', async () => {
  const app = setup();
  try {
    const input = element(app.w.document, '[contenteditable]');
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const request = required(app.requests('translate').find((v) => v.purpose === 'reply'));
    app.dispatchInput('compositionstart', input);
    app.dispatchInput('compositionend', input);
    expect(app.w.testAdapter.draft()).toBe('See you soon');
    expect(
      required(
        app.sent.find(
          (v) => v.type === 'cancel_translation' && v.request_id === request.request_id,
        ),
      ),
    ).toBeTruthy();
    const preview = element<HTMLButtonElement>(app.w.document, '.wisp-preview-button');
    expect(preview.disabled).toBe(false);
    preview.click();
    expect(app.sent.filter((v) => v.type === 'translate' && v.purpose === 'reply').length).toBe(2);
  } finally {
    app.dom.window.close();
  }
});

test('composer controls can change the anchor without losing the current draft preview', async () => {
  const app = setup();
  try {
    const footer = element(app.w.document, 'footer'),
      outer = app.w.document.createElement('div'),
      field = app.w.document.createElement('div');
    const input = element(footer, '[contenteditable]'),
      send = element<HTMLButtonElement>(footer, '#send');
    field.append(input);
    outer.append(field, send);
    footer.replaceWith(outer);
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
    const icon = app.w.document.createElement('span');
    icon.dataset.icon = 'send';
    send.append(icon);
    await app.flush();
    expect(required(app.w.testAdapter.composer()).panel).toBe(outer);
    expect(app.w.document.querySelectorAll('.wisp-composer').length).toBe(1);
    expect(element(app.w.document, '.wisp-preview-text').textContent).toBe('Nos vemos pronto');
    expect(field.classList.contains('wisp-compose-shell')).toBe(false);
    expect(outer.classList.contains('wisp-compose-shell')).toBe(true);
    expect(app.sent.filter((v) => v.type === 'translate' && v.purpose === 'reply').length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});

test('an explicit history clear regenerates messages and language changes update reading and draft labels', async () => {
  const saved = new Map([['false_123@lid_ONE', 'Hello']]);
  const app = setup({ saved });
  try {
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(0);
    saved.clear();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 2,
      enabled: true,
      history_revision: 1,
      reading_language: 'french',
      reading_label: 'French',
      reply_language: 'italian',
      reply_label: 'Italian',
    });
    await app.flush();
    const request = required(app.sent.find((value) => value.type === 'translate'));
    app.emit({
      type: 'translation',
      conversation: request.conversation,
      request_id: request.request_id,
      text: 'Bonjour',
    });
    expect(element(app.w.document, '.wisp-inline small').textContent).toBe('French');
    expect(element<HTMLButtonElement>(app.w.document, '.wisp-prepare').textContent).toBe(
      'Use Italian',
    );
    expect(element(app.w.document, '.wisp-draft-language').textContent).toBe('Italian');
    expect(app.sent.filter((value) => value.type === 'translate').length).toBe(1);
  } finally {
    app.dom.window.close();
  }
});

test('attachment captions use live preview and native preparation without sending or changing the background draft', async () => {
  const app = setup();
  try {
    const background = element(app.w.document, '[contenteditable]');
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const media = app.w.document.createElement('section');
    media.dataset.testid = 'media-editor';
    media.innerHTML =
      '<img alt="Attachment"><div data-testid="media-caption-input-container"><div role="textbox" contenteditable="true">Look at this 😊</div><button>Emoji</button></div><footer><button id="media-send" aria-label="Send">Send</button></footer>';
    app.w.document.body.append(media);
    await app.flush();
    const caption = element(media, '[contenteditable]');
    expect(required(app.w.testAdapter.composer()).input).toBe(caption);
    expect(required(app.w.testAdapter.composer()).kind).toBe('attachment');
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const request = required(
      app.requests('translate').findLast((value) => value.purpose === 'reply'),
    );
    expect(request.text).toBe('Look at this 😊');
    app.emit({
      type: 'translation',
      conversation: request.conversation,
      request_id: request.request_id,
      text: 'Mira esto 😊',
    });
    expect(element(app.w.document, '.wisp-composer-attachment')).toBeTruthy();
    app.prepare();
    expect(app.commitEdit()).toBe(true);
    await app.advance(60);
    expect(caption.textContent).toBe('Mira esto 😊');
    expect(background.textContent).toBe('See you soon');
    expect(app.w.testAdapter.draft()).toBe('Mira esto 😊');
    media.remove();
    await app.flush();
    expect(required(app.w.testAdapter.composer()).input).toBe(background);
    expect(app.w.document.querySelector('.wisp-composer-attachment')).toBe(null);
  } finally {
    app.dom.window.close();
  }
});

test('ambiguous attachment editors and closing media during preparation cannot edit the background composer', async () => {
  const app = setup();
  try {
    app.start();
    app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
    await app.flush();
    const media = app.w.document.createElement('section');
    media.dataset.testid = 'media-editor';
    media.innerHTML =
      '<div data-testid="media-caption-input-container"><div role="textbox" contenteditable="true">See you soon</div></div><button aria-label="Send">Send</button>';
    app.w.document.body.append(media);
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-preview-button').click();
    const request = required(
      app.requests('translate').findLast((value) => value.purpose === 'reply'),
    );
    app.emit({
      type: 'translation',
      conversation: request.conversation,
      request_id: request.request_id,
      text: 'Nos vemos pronto',
    });
    app.prepare();
    media.remove();
    expect(app.commitEdit()).toBe(false); // Identical text in another editor still fails closed.
    expect(element(app.w.document, '[contenteditable]').textContent).toBe('See you soon');
    media.innerHTML += '<div role="textbox" contenteditable="true">Another caption</div>';
    app.w.document.body.append(media);
    expect(app.w.testAdapter.composer()).toBe(null);
  } finally {
    app.dom.window.close();
  }
});
