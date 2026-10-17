import { test, expect } from 'vitest';
import { setup } from './support/harness';
import { element, required } from './support/fixtures';

const original = 'Hola ¿Vienes? 😊';
const translated = 'Hello, are you coming? 😊';

function sidebar(app: ReturnType<typeof setup>, group = false) {
  app.w.document.body.insertAdjacentHTML(
    'afterbegin',
    `<aside id="pane-side"><div role="listitem" aria-selected="true" id="chat-one">
      <div role="button"><img src="avatar-one.png" alt=""><span title="Contact">Contact</span>
      <div data-testid="cell-frame-secondary"><span data-icon="status-dblcheck">✓✓</span>
      ${group ? '<span id="sender">Person: </span>' : ''}<span title="${original}" id="preview-one"><span dir="auto">Hola ¿Vienes? <img alt="😊"></span></span></div>
      <span id="unread">2</span></div></div>
      <div role="listitem" aria-selected="false" id="chat-two"><span title="Contact">Contact</span>
      <span title="${original}" id="preview-two">${original}</span></div></aside>`,
  );
}

async function complete(app: ReturnType<typeof setup>) {
  await app.flush();
  const request = required(app.requests('translate').find((value) => value.purpose === 'reading'));
  app.emit({
    type: 'translation',
    conversation: request.conversation,
    request_id: request.request_id,
    text: translated,
  });
  await app.flush();
}

function enable(app: ReturnType<typeof setup>) {
  app.start();
  app.emit({ type: 'config', conversation: '123@lid', revision: 1, enabled: true });
}

test('completed translations update only the enabled selected row and preserve its native controls', async () => {
  const app = setup();
  try {
    sidebar(app, true);
    let clicks = 0;
    element(app.w.document, '#chat-one').addEventListener('click', () => clicks++);
    enable(app);
    await complete(app);
    const preview = element(app.w.document, '#chat-one .wisp-chat-preview');
    expect(preview.textContent).toBe(translated);
    expect(preview.title).toBe('Hola\n¿Vienes? 😊');
    expect(preview.dir).toBe('auto');
    expect(
      element(app.w.document, '#preview-one').classList.contains('wisp-chat-preview-original'),
    ).toBe(true);
    expect(element(app.w.document, '#preview-one img').getAttribute('alt')).toBe('😊');
    expect(element(app.w.document, '#sender').textContent).toBe('Person: ');
    expect(element(app.w.document, '#unread').textContent).toBe('2');
    expect(element(app.w.document, '[data-icon="status-dblcheck"]').textContent).toBe('✓✓');
    expect(app.w.document.querySelector('#chat-two .wisp-chat-preview')).toBeNull();
    preview.click();
    expect(clicks).toBe(1);
    expect(app.requests('translate')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

test('saved translations populate previews offline without extra inference', async () => {
  const app = setup({ saved: new Map([['false_123@lid_ONE', translated]]) });
  try {
    sidebar(app);
    app.start();
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      can_translate: false,
    });
    await app.flush();
    expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe(translated);
    expect(app.requests('translate')).toHaveLength(0);
  } finally {
    app.dom.window.close();
  }
});

test('new preview text removes the old translation and does not translate a closed chat', async () => {
  const app = setup();
  try {
    sidebar(app);
    enable(app);
    await complete(app);
    const source = element(app.w.document, '#preview-one');
    source.textContent = 'Un mensaje nuevo';
    source.title = 'Un mensaje nuevo';
    await app.flush();
    expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
    expect(source.classList.contains('wisp-chat-preview-original')).toBe(false);
    expect(source.textContent).toBe('Un mensaje nuevo');
    expect(app.requests('translate')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

test('preview follows edits once the new message translation completes', async () => {
  const app = setup();
  try {
    sidebar(app);
    enable(app);
    await complete(app);
    element(app.w.document, '.selectable-text').textContent = 'Nos vemos mañana';
    const source = element(app.w.document, '#preview-one');
    source.textContent = 'Nos vemos mañana';
    source.title = 'Nos vemos mañana';
    await app.flush();
    expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
    const request = required(app.requests('translate').at(-1));
    app.emit({
      type: 'translation',
      conversation: request.conversation,
      request_id: request.request_id,
      text: 'See you tomorrow',
    });
    await app.flush();
    expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe('See you tomorrow');
  } finally {
    app.dom.window.close();
  }
});

test('enabled previews remain when navigating to a different disabled chat with the same name and source', async () => {
  const app = setup();
  try {
    sidebar(app);
    enable(app);
    await complete(app);
    element(app.w.document, '#chat-one').setAttribute('aria-selected', 'false');
    element(app.w.document, '#chat-two').setAttribute('aria-selected', 'true');
    element(app.w.document, '[data-id]').dataset.id = 'false_456@lid_TWO';
    await app.flush();
    app.emit({ type: 'config', conversation: '456@lid', revision: 2, enabled: false });
    await app.flush();
    expect(element(app.w.document, '#chat-one .wisp-chat-preview').textContent).toBe(translated);
    expect(app.w.document.querySelector('#chat-two .wisp-chat-preview')).toBeNull();
    expect(app.requests('translate')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

for (const change of ['disabled', 'language', 'history'] as const) {
  test(`${change} restores the original preview without leaving stale text`, async () => {
    const app = setup();
    try {
      sidebar(app);
      enable(app);
      await complete(app);
      app.emit({
        type: 'config',
        conversation: '123@lid',
        revision: 2,
        enabled: change !== 'disabled',
        ...(change === 'language' ? { reading_language: 'french', reading_label: 'French' } : {}),
        ...(change === 'history' ? { history_revision: 2 } : {}),
      });
      expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
      expect(
        element(app.w.document, '#preview-one').classList.contains('wisp-chat-preview-original'),
      ).toBe(false);
    } finally {
      app.dom.window.close();
    }
  });
}

for (const outgoing of [false, true]) {
  test(`hiding sent translations preserves incoming previews (outgoing=${outgoing})`, async () => {
    const app = setup();
    try {
      sidebar(app);
      if (outgoing) {
        element(app.w.document, '[data-id]').dataset.id = 'true_123@lid_ONE';
        element(app.w.document, '.message-in').className = 'message-out';
      }
      enable(app);
      await complete(app);
      app.emit({
        type: 'config',
        conversation: '123@lid',
        revision: 2,
        enabled: true,
        view_preferences: { include_sent: false },
      });
      await app.flush();
      expect(app.w.document.querySelectorAll('.wisp-chat-preview')).toHaveLength(outgoing ? 0 : 1);
      expect(
        element(app.w.document, '#preview-one').classList.contains('wisp-chat-preview-original'),
      ).toBe(!outgoing);
      app.emit({
        type: 'config',
        conversation: '123@lid',
        revision: 3,
        enabled: true,
        view_preferences: { include_sent: true },
      });
      await app.flush();
      expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe(translated);
      expect(app.requests('translate')).toHaveLength(1);
    } finally {
      app.dom.window.close();
    }
  });
}

for (const change of [
  'title',
  'avatar',
  'row_id',
  'title_node',
  'preview_node',
  'reattached',
] as const) {
  test(`recycling an inactive sidebar row (${change}) removes its old translation`, async () => {
    const app = setup();
    try {
      sidebar(app);
      enable(app);
      await complete(app);
      element(app.w.document, '#chat-one').setAttribute('aria-selected', 'false');
      element(app.w.document, '#chat-two').setAttribute('aria-selected', 'true');
      element(app.w.document, '[data-id]').dataset.id = 'false_456@lid_TWO';
      await app.flush();
      app.emit({ type: 'config', conversation: '456@lid', revision: 2, enabled: false });
      const row = element(app.w.document, '#chat-one');
      if (change === 'title') element(row, 'span[title]').title = 'Another contact';
      if (change === 'avatar') element(row, 'img').setAttribute('src', 'other-avatar.png');
      if (change === 'row_id') row.dataset.id = '789@lid';
      if (change === 'title_node') {
        const title = element(row, 'span[title]');
        title.replaceWith(title.cloneNode(true));
      }
      if (change === 'preview_node') {
        const source = element(row, '#preview-one');
        const replacement = source.cloneNode(true) as HTMLElement;
        replacement.classList.remove('wisp-chat-preview-original');
        source.replaceWith(replacement);
      }
      if (change === 'reattached') {
        const parent = required(row.parentElement);
        row.remove();
        parent.append(row);
      }
      await app.flush();
      expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
      expect(
        element(app.w.document, '#preview-one').classList.contains('wisp-chat-preview-original'),
      ).toBe(false);
    } finally {
      app.dom.window.close();
    }
  });
}

test('replacing the native preview restores a cached translation without duplicate overlays', async () => {
  const app = setup();
  try {
    sidebar(app);
    enable(app);
    await complete(app);
    const source = element(app.w.document, '#preview-one');
    source.replaceWith(source.cloneNode(true));
    await app.flush();
    expect(app.w.document.querySelectorAll('.wisp-chat-preview')).toHaveLength(1);
    expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe(translated);
    await app.advance(2000);
    expect(app.requests('translate')).toHaveLength(1);
    app.w.testRuntime?.dispose();
    expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
    expect(app.w.document.querySelector('.wisp-chat-preview-original')).toBeNull();
  } finally {
    app.dom.window.close();
  }
});

test('a preview mounted after the message translated reuses the completed result', async () => {
  const app = setup();
  try {
    sidebar(app);
    const source = element(app.w.document, '#preview-one');
    const parent = required(source.parentElement);
    source.remove();
    enable(app);
    await complete(app);
    expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
    parent.append(source);
    await app.flush();
    expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe(translated);
    expect(app.requests('translate')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

test('a contact name matching a message is never replaced', async () => {
  const app = setup();
  try {
    sidebar(app);
    const title = element(app.w.document, '#chat-one span[title]');
    title.textContent = original;
    title.title = original;
    enable(app);
    await complete(app);
    expect(title.classList.contains('wisp-chat-preview-original')).toBe(false);
    expect(title.textContent).toBe(original);
    expect(element(app.w.document, '.wisp-chat-preview').textContent).toBe(translated);
  } finally {
    app.dom.window.close();
  }
});

test('a timestamp matching an older translated message is never replaced', async () => {
  const app = setup();
  try {
    sidebar(app);
    element(app.w.document, '.selectable-text').textContent = 'Yesterday';
    const latest = element(app.w.document, '#preview-one');
    latest.textContent = 'Un mensaje nuevo';
    latest.title = 'Un mensaje nuevo';
    element(app.w.document, '#chat-one span[title]').insertAdjacentHTML(
      'afterend',
      '<span title="Yesterday" id="timestamp">Yesterday</span>',
    );
    enable(app);
    await complete(app);
    expect(app.w.document.querySelector('.wisp-chat-preview')).toBeNull();
    expect(
      element(app.w.document, '#timestamp').classList.contains('wisp-chat-preview-original'),
    ).toBe(false);
  } finally {
    app.dom.window.close();
  }
});
