import { expect, test } from 'vitest';
import { setup } from './support/harness';
import { element, required, rect } from './support/fixtures';

function fixture(options?: Parameters<typeof setup>[0]) {
  const app = setup(options);
  element(app.w.document, 'footer').insertAdjacentHTML(
    'beforebegin',
    '<div data-id="false_123@lid_VOICE"><div class="message-in"><button aria-label="Play voice message"><span data-icon="audio-play"></span></button></div></div>',
  );
  app.start();
  return app;
}
const speech = {
  ready: true,
  downloading: false,
  progress: 100,
  error: '',
  label: 'Whisper',
  download_bytes: 487601967,
};
test('saved voice translations restore on return without audio setup, a click, or a new transcription', async () => {
  const savedVoices = new Map([
    [
      'false_123@lid_VOICE',
      {
        transcript: {
          text: 'Mañana en el parque.',
          language: 'es',
          confidence: 0.95,
          review: false,
        },
        language: 'es',
        translation: 'Tomorrow at the park.',
      },
    ],
  ]);
  for (let visit = 0; visit < 2; visit++) {
    const app = setup({ savedVoices });
    try {
      element(app.w.document, 'footer').insertAdjacentHTML(
        'beforebegin',
        '<div data-id="false_123@lid_VOICE"><div class="message-in"><button aria-label="Play voice message"></button></div></div>',
      );
      app.start();
      app.emit({
        type: 'config',
        conversation: '123@lid',
        revision: 1,
        enabled: true,
        can_translate: false,
        voice_enabled: false,
        speech: { ...speech, ready: false },
        voice_languages: languages,
      });
      await app.flush();
      expect(element(app.w.document, '.wisp-voice-output').textContent).toContain(
        'Tomorrow at the park.',
      );
      expect(element(app.w.document, '.wisp-voice-original').textContent).toContain(
        'Mañana en el parque.',
      );
      expect(element<HTMLSelectElement>(app.w.document, '.wisp-voice-select').value).toBe('es');
      expect(app.requests('voice_begin')).toHaveLength(0);
      expect(app.requests('voice_audio')).toHaveLength(0);
      expect(app.requests('speech_download')).toHaveLength(0);
    } finally {
      app.dom.window.close();
    }
  }
});
test('modern classless voice notes use bubble alignment and render an enable button', async () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main');
    main.getBoundingClientRect = () => rect({ left: 0, right: 700, width: 700 });
    element(main, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="3EB0A123456789ABCDEF0123456789AB"><div class="voice-body"><div data-testid="audio-player"><button aria-label="Play"><span data-icon="play"></span></button></div></div></div>',
    );
    const body = element(main, '.voice-body');
    body.getBoundingClientRect = () => rect({ left: 40, right: 370, width: 330 });
    const note = required(app.w.testAdapter.voiceNotes(main)[0]);
    expect(note.element).toBe(body);
    expect(note.direction).toBe('incoming');
    app.start();
    configure(app, false);
    await app.flush();
    expect(element(body, '.wisp-voice-start').textContent).toBe('Enable voice translation');
    expect(app.requests('speech_download')).toHaveLength(0);
    expect(app.w.testAdapter.voiceNotes(main)).toHaveLength(1);
    // Removing the injected UI restores the unmodified native geometry test.
    app.w.testRuntime?.dispose();
    body.getBoundingClientRect = () => rect({ left: 330, right: 660, width: 330 });
    expect(required(app.w.testAdapter.voiceNotes(main)[0]).direction).toBe('outgoing');
    body.getBoundingClientRect = () => rect({ left: 185, right: 515, width: 330 });
    expect(app.w.testAdapter.voiceNotes(main)).toHaveLength(0);
  } finally {
    app.dom.window.close();
  }
});

test('generic video play controls and quoted voice players do not become voice notes', () => {
  const app = setup();
  try {
    const main = element(app.w.document, '#main');
    element(main, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="false_123@lid_VIDEO"><div class="message-in"><button><span data-icon="play"></span></button></div></div><div data-id="false_123@lid_QUOTED"><div class="message-in"><div data-testid="quoted-message"><div data-testid="audio-player"><button><span data-icon="play"></span></button></div></div></div></div>',
    );
    expect(app.w.testAdapter.voiceNotes(main)).toHaveLength(0);
  } finally {
    app.dom.window.close();
  }
});
const languages = [
  { code: 'es', label: 'Spanish', supported: true },
  { code: 'yue', label: 'Cantonese', supported: false },
];
function configure(
  app: ReturnType<typeof fixture>,
  enabled = true,
  automatic = false,
  ready = enabled,
) {
  app.emit({
    type: 'config',
    conversation: '123@lid',
    revision: 1,
    enabled: true,
    can_translate: true,
    voice_enabled: enabled,
    voice_auto: automatic,
    speech: ready ? speech : { ...speech, ready: false },
    voice_languages: languages,
  });
}

test('voice notes require a click and keep the original transcript alongside the translation', async () => {
  const app = fixture();
  try {
    configure(app);
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(0);
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-start').click();
    const request = required(app.requests('voice_begin').at(-1));
    expect(request.language).toBeNull();
    app.emit({
      type: 'voice_transcript',
      request_id: request.request_id,
      conversation: '123@lid',
      view_id: request.view_id,
      transcript: {
        text: 'Mañana en el parque <script>literal</script>',
        language: 'es',
        confidence: 0.95,
        review: false,
      },
    });
    app.emit({
      type: 'translation',
      request_id: request.request_id,
      conversation: '123@lid',
      text: 'Tomorrow at the park.',
    });
    await app.flush();
    expect(element(app.w.document, '.wisp-voice-output').textContent).toContain(
      'Tomorrow at the park.',
    );
    expect(element(app.w.document, '.wisp-voice-original').textContent).toContain(
      '<script>literal</script>',
    );
    expect(app.w.document.querySelector('.wisp-voice-original script')).toBeNull();
    expect(app.requests('voice_audio')).toHaveLength(0);
    expect(
      element<HTMLOptionElement>(app.w.document, '.wisp-voice-select option[value=yue]').disabled,
    ).toBe(true);
    const select = element<HTMLSelectElement>(app.w.document, '.wisp-voice-select');
    select.value = 'es';
    select.dispatchEvent(new app.w.Event('change'));
    expect(element(app.w.document, '.wisp-voice-original').hidden).toBe(true);
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-redo').click();
    expect(required(app.requests('voice_begin').at(-1)).language).toBe('es');
  } finally {
    app.dom.window.close();
  }
});

test('first-use setup downloads only after enabling and then resumes the clicked note', async () => {
  const app = fixture();
  try {
    configure(app, false);
    await app.flush();
    expect(app.requests('speech_download')).toHaveLength(0);
    expect(element(app.w.document, '.wisp-voice-start').textContent).toBe(
      'Enable voice translation',
    );
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-start').click();
    expect(app.requests('speech_download')).toHaveLength(1);
    expect(app.requests('voice_begin')).toHaveLength(0);
    app.emit({
      type: 'config',
      conversation: '123@lid',
      revision: 1,
      enabled: true,
      can_translate: true,
      voice_enabled: true,
      voice_auto: false,
      speech: { ...speech, ready: false, downloading: true, progress: 42 },
      voice_languages: languages,
    });
    await app.flush();
    expect(element(app.w.document, '.wisp-voice-status').textContent).toContain('42%');
    app.emit({ type: 'speech_model', speech });
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

test('switching chats cancels transcription and late output cannot appear in the new chat', async () => {
  const app = fixture();
  try {
    configure(app);
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-start').click();
    const request = required(app.requests('voice_begin').at(-1));
    element(app.w.document, 'header [title]').setAttribute('title', 'Other contact');
    element(app.w.document, '[data-id="false_123@lid_ONE"]').setAttribute(
      'data-id',
      'false_456@lid_TWO',
    );
    element(app.w.document, '[data-id="false_123@lid_VOICE"]').remove();
    await app.flush();
    expect(
      app.sent.some((r) => r.type === 'voice_cancel' && r.request_id === request.request_id),
    ).toBe(true);
    app.emit({
      type: 'voice_transcript',
      request_id: request.request_id,
      conversation: '123@lid',
      view_id: request.view_id,
      transcript: {
        text: 'Private old transcript',
        language: 'es',
        confidence: 0.95,
        review: false,
      },
    });
    app.emit({
      type: 'translation',
      request_id: request.request_id,
      conversation: '123@lid',
      text: 'Private old translation',
    });
    await app.flush();
    expect(app.w.document.querySelector('.wisp-voice')).toBeNull();
    expect(app.w.document.body.textContent).not.toContain('Private old');
  } finally {
    app.dom.window.close();
  }
});

test('translation failures leave the machine transcript available and private view-once notes are skipped', async () => {
  const app = fixture();
  try {
    element(app.w.document, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="false_123@lid_PRIVATE"><div class="message-in"><span data-icon="view-once-audio"></span><button aria-label="Play voice message"></button></div></div>',
    );
    configure(app);
    await app.flush();
    expect(app.w.document.querySelectorAll('.wisp-voice')).toHaveLength(1);
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-start').click();
    const request = required(app.requests('voice_begin').at(-1));
    app.emit({
      type: 'voice_transcript',
      request_id: request.request_id,
      conversation: '123@lid',
      view_id: request.view_id,
      transcript: { text: 'Mañana', language: 'es', confidence: null, review: true },
    });
    app.emit({
      type: 'voice_error',
      request_id: request.request_id,
      conversation: '123@lid',
      view_id: request.view_id,
      message: 'Reconnect ChatGPT',
    });
    await app.flush();
    element<HTMLButtonElement>(app.w.document, '.wisp-voice-original-button').click();
    expect(element(app.w.document, '.wisp-voice-original').hidden).toBe(false);
    expect(element(app.w.document, '.wisp-voice-original').textContent).toContain('Mañana');
    expect(element(app.w.document, '.wisp-voice-status').textContent).toBe('Reconnect ChatGPT');
  } finally {
    app.dom.window.close();
  }
});

test('automatic voice translation waits for saved results and processes incoming notes one at a time', async () => {
  const app = fixture();
  try {
    element(app.w.document, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="false_123@lid_SECOND"><div class="message-in"><button aria-label="Play voice message"></button></div></div><div data-id="true_123@lid_SENT"><div class="message-out"><button aria-label="Play voice message"></button></div></div>',
    );
    configure(app, true, true);
    await app.flush();
    expect(app.requests('saved_voice')).toHaveLength(3);
    expect(app.requests('voice_begin')).toHaveLength(1);
    const first = required(app.requests('voice_begin').at(-1));
    expect(first.message_id).toBe('false_123@lid_VOICE');
    expect(element(app.w.document, '.wisp-voice-original-button').textContent).toBe('Original');
    expect(element(app.w.document, '.wisp-voice-original-button').hasAttribute('disabled')).toBe(
      true,
    );
    app.emit({
      ...first,
      type: 'voice_transcript',
      transcript: { text: 'Mañana', language: 'es', confidence: 0.95, review: false },
    });
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(1);
    app.emit({
      type: 'translation',
      request_id: first.request_id,
      conversation: first.conversation,
      text: 'Tomorrow',
    });
    expect(app.requests('voice_begin')).toHaveLength(2);
    const second = required(app.requests('voice_begin').at(-1));
    expect(second.message_id).toBe('false_123@lid_SECOND');
    app.emit({
      ...second,
      type: 'voice_transcript',
      transcript: { text: 'Hoy', language: 'es', confidence: 0.95, review: false },
    });
    app.emit({
      type: 'translation',
      request_id: second.request_id,
      conversation: second.conversation,
      text: 'Today',
    });
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(2);
    const sent = element(app.w.document, '[data-id="true_123@lid_SENT"] .wisp-voice-start');
    expect(sent.hidden).toBe(false);
    expect(app.requests('voice_audio')).toHaveLength(0);
  } finally {
    app.dom.window.close();
  }
});

test('automatic processing never retranscribes a restored translation and can reuse a saved raw transcript without a model', async () => {
  for (const complete of [true, false]) {
    const app = fixture({
      savedVoices: new Map([
        [
          'false_123@lid_VOICE',
          {
            transcript: { text: 'Mañana', language: 'es', confidence: 0.95, review: false },
            language: 'es',
            translation: complete ? 'Tomorrow' : null,
          },
        ],
      ]),
    });
    try {
      configure(app, true, true, false);
      await app.flush();
      expect(app.requests('voice_begin')).toHaveLength(complete ? 0 : 1);
      if (!complete) expect(required(app.requests('voice_begin')[0]).language).toBe('es');
      expect(app.requests('voice_audio')).toHaveLength(0);
      expect(app.requests('speech_download')).toHaveLength(0);
    } finally {
      app.dom.window.close();
    }
  }
});

test('automatic processing waits for cache hydration and skips notes outside the visible chat', async () => {
  const app = fixture({ autoHydrate: false });
  try {
    let visible = false;
    app.w.testAdapter.voiceVisible = () => visible;
    configure(app, true, true);
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(0);
    const hydration = required(app.requests('saved_voice')[0]);
    app.emit({
      ...hydration,
      type: 'voice_saved',
      transcript: null,
      language: null,
      translation: null,
    });
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(0);
    visible = true;
    app.w.document.dispatchEvent(new app.w.Event('scroll'));
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(1);
  } finally {
    app.dom.window.close();
  }
});

test('turning automatic translation off stops the remaining queue and failures do not retry in a loop', async () => {
  const app = fixture();
  try {
    element(app.w.document, 'footer').insertAdjacentHTML(
      'beforebegin',
      '<div data-id="false_123@lid_SECOND"><div class="message-in"><button aria-label="Play voice message"></button></div></div>',
    );
    configure(app, true, true);
    await app.flush();
    const first = required(app.requests('voice_begin')[0]);
    configure(app, true, false);
    app.emit({
      type: 'voice_error',
      request_id: first.request_id,
      conversation: first.conversation,
      view_id: first.view_id,
      message: 'Choose a spoken language',
    });
    await app.advance(6000);
    expect(app.requests('voice_begin')).toHaveLength(1);
    configure(app, true, true);
    await app.flush();
    expect(app.requests('voice_begin')).toHaveLength(2);
    expect(required(app.requests('voice_begin').at(-1)).message_id).toBe('false_123@lid_SECOND');
    await app.advance(6000);
    expect(app.requests('voice_begin')).toHaveLength(2);
  } finally {
    app.dom.window.close();
  }
});

test('Original and options use exclusive popovers, and manual retranscription explicitly bypasses the saved raw result', async () => {
  const app = fixture({
    savedVoices: new Map([
      [
        'false_123@lid_VOICE',
        {
          transcript: { text: 'Mañana', language: 'es', confidence: 0.6, review: true },
          language: null,
          translation: 'Tomorrow',
        },
      ],
    ]),
  });
  try {
    configure(app);
    await app.flush();
    const doc = app.w.document;
    expect(element(doc, '.wisp-voice-start').hidden).toBe(true);
    element<HTMLButtonElement>(doc, '.wisp-voice-original-button').click();
    expect(element(doc, '.wisp-voice-original').hidden).toBe(false);
    expect(element(doc, '.wisp-voice-review').hidden).toBe(false);
    element<HTMLButtonElement>(doc, '.wisp-voice-dots').click();
    expect(element(doc, '.wisp-voice-original').hidden).toBe(true);
    expect(element(doc, '.wisp-voice-options').hidden).toBe(false);
    const select = element<HTMLSelectElement>(doc, '.wisp-voice-select');
    select.value = 'es';
    select.dispatchEvent(new app.w.Event('change'));
    expect(element(doc, '.wisp-voice-output').textContent).toBe('Tomorrow');
    element<HTMLButtonElement>(doc, '.wisp-voice-redo').click();
    const request = required(app.requests('voice_begin').at(-1));
    expect(request.language).toBe('es');
    expect(request.retranscribe).toBe(true);
    expect(element(doc, '.wisp-voice-output').textContent).toBe('Tomorrow');
    element<HTMLButtonElement>(doc, '.wisp-voice-dots').click();
    doc.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(element(doc, '.wisp-voice-options').hidden).toBe(true);
    app.w.testRuntime?.dispose();
    expect(doc.querySelector('.wisp-voice-popover')).toBeNull();
  } finally {
    app.dom.window.close();
  }
});
