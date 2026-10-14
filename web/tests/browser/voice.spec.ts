import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { PageRequest, NativeChannel } from '../../src/contracts';

type VoiceFixture = Window & {
  requests: PageRequest[];
  completeVoice(translation?: string, original?: string): void;
  configureVoice(enabled: boolean, ready: boolean): void;
  configureChat(enabled: boolean): void;
  configureAutomatic(enabled: boolean): void;
  nativeWidth: { bubble: number; player: number };
};
async function openVoice(
  page: Page,
  detached: boolean,
  enabled = true,
  modern = false,
  naturalLayout?: 'block' | 'flex',
  automatic = false,
) {
  await page.route('https://web.whatsapp.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body{margin:0;background:#111b21;color:white}#main{padding:20px;width:min(350px,100%);box-sizing:border-box}.message-in,.voice-body{padding:12px;background:#202c33;border-radius:12px}.voice-body{display:flex;width:300px;box-sizing:border-box}${naturalLayout ? `.voice-body{display:${naturalLayout === 'block' ? 'inline-block' : 'flex'};width:max-content;max-width:100%;white-space:nowrap}[data-id]{display:flex}[data-testid=audio-player]{width:280px;max-width:100%;min-width:0;flex-shrink:1;box-sizing:border-box}` : ''}footer{margin-top:20px}button{padding:8px}</style><main id="main"><header><span title="Contact">Contact</span></header><div data-id="${modern ? '3EB0A123456789ABCDEF0123456789AB' : 'false_123@lid_VOICE'}"><div class="${modern ? 'voice-body' : 'message-in'}"><div data-testid="audio-player"><button aria-label="${modern ? 'Play' : 'Play voice message'}"><span data-icon="${modern ? 'play' : 'audio-play'}">Play</span></button><span data-icon="ptt-incoming"></span></div></div></div><footer><div role="textbox" contenteditable="true"></div></footer></main>`,
    }),
  );
  await page.addInitScript(
    ({ detached, enabled, automatic }) => {
      const w = window as unknown as VoiceFixture;
      w.requests = [];
      let emit = (_: unknown) => {};
      let current: Extract<PageRequest, { type: 'active_conversation' }> | undefined;
      let voiceEnabled = enabled;
      let chatEnabled = true;
      let ready = enabled;
      let voiceAutomatic = automatic;
      const saved = new Map<
        string,
        {
          transcript: { text: string; language: string; confidence: number; review: boolean };
          language: string | null;
          translation: string;
        }
      >();
      function config() {
        if (!current) return;
        emit({
          type: 'config',
          conversation: current.conversation || 'modern-voice-chat',
          view_id: current.view_id,
          revision: 1,
          generation: 1,
          enabled: chatEnabled,
          can_translate: true,
          voice_enabled: voiceEnabled,
          voice_auto: voiceAutomatic,
          voice_max_minutes: 20,
          reading_label: 'English',
          reply_label: 'Spanish',
          speech: {
            ready,
            downloading: !ready && voiceEnabled,
            progress: 25,
            error: '',
            label: 'Whisper',
            download_bytes: 487601967,
          },
          voice_languages: [
            { code: 'es', label: 'Spanish', supported: true },
            { code: 'yue', label: 'Cantonese', supported: false },
          ],
          view_preferences: { live_preview: false },
        });
      }
      w.configureAutomatic = (enabled) => {
        voiceAutomatic = enabled;
        config();
      };
      w.configureVoice = (enabled, modelReady) => {
        voiceEnabled = enabled;
        ready = modelReady;
        config();
      };
      w.configureChat = (enabled) => {
        chatEnabled = enabled;
        config();
      };
      w.completeVoice = (
        translation = 'Tomorrow at the park.',
        original = 'Mañana en el parque.',
      ) => {
        const request = w.requests.findLast(
          (r): r is Extract<PageRequest, { type: 'voice_begin' }> => r.type === 'voice_begin',
        );
        if (!request) throw new Error('Missing voice request');
        saved.set(request.message_id, {
          transcript: { text: original, language: 'es', confidence: 0.96, review: false },
          language: request.language,
          translation,
        });
        emit({
          ...request,
          transcript: {
            text: original,
            language: 'es',
            confidence: 0.96,
            review: false,
          },
          type: 'voice_transcript',
        });
        emit({
          type: 'translation',
          request_id: request.request_id,
          conversation: request.conversation,
          view_id: request.view_id,
          text: translation,
        });
      };
      w.qt = { webChannelTransport: {} };
      w.QWebChannel = class {
        constructor(
          _: unknown,
          connect: (channel: { objects: { translation: NativeChannel } }) => void,
        ) {
          connect({
            objects: {
              translation: {
                translationEvent: {
                  connect(callback: (text: string) => void) {
                    emit = (value) => callback(JSON.stringify(value));
                  },
                },
                submit(text: string) {
                  const request = JSON.parse(text) as PageRequest;
                  w.requests.push(request);
                  if (request.type === 'active_conversation') {
                    current = request;
                    queueMicrotask(config);
                  } else if (request.type === 'saved_voice') {
                    const result = saved.get(request.message_id);
                    queueMicrotask(() =>
                      emit({
                        ...request,
                        type: 'voice_saved',
                        transcript: result?.transcript || null,
                        language: result?.language || null,
                        translation: result?.translation || null,
                      }),
                    );
                  } else if (request.type === 'voice_begin' || request.type === 'voice_audio') {
                    queueMicrotask(() =>
                      emit({
                        type: 'voice_ack',
                        request_id: request.request_id,
                        conversation: request.conversation,
                        view_id: request.view_id,
                        index: request.type === 'voice_audio' ? request.index : -1,
                      }),
                    );
                  }
                },
              },
            },
          });
        }
      };
      document.addEventListener('DOMContentLoaded', () => {
        const bytes = new ArrayBuffer(44 + 48000 * 2),
          view = new DataView(bytes);
        const text = (offset: number, value: string) =>
          [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        text(0, 'RIFF');
        view.setUint32(4, bytes.byteLength - 8, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 48000, true);
        view.setUint32(28, 96000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, 96000, true);
        for (let i = 0; i < 48000; i++)
          view.setInt16(44 + i * 2, Math.sin((i * 440 * 2 * Math.PI) / 48000) * 16000, true);
        const source = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        if (detached)
          document.querySelector('[data-id] button')!.addEventListener('click', () => {
            void new Audio(source).play();
          });
        else {
          const audio = document.createElement('audio');
          audio.src = source;
          document.querySelector('[data-id]')!.append(audio);
        }
      });
    },
    { detached, enabled, automatic },
  );
  await page.addInitScript({
    path: fileURLToPath(new URL('../../dist/voice-source.js', import.meta.url)),
  });
  await page.goto('https://web.whatsapp.com/');
  await page.evaluate(() => {
    const bubble = document.querySelector('.voice-body, .message-in')!,
      player = document.querySelector('[data-testid=audio-player]')!;
    (window as unknown as VoiceFixture).nativeWidth = {
      bubble: bubble.getBoundingClientRect().width,
      player: player.getBoundingClientRect().width,
    };
  });
  await page.addScriptTag({ path: fileURLToPath(new URL('../../dist/wisp.js', import.meta.url)) });
  if (automatic) await expect(page.locator('.wisp-voice')).toBeVisible();
  else await expect(page.locator('.wisp-voice-start')).toBeVisible();
}

for (const { detached, modern } of [
  { detached: false, modern: false },
  { detached: true, modern: false },
  { detached: true, modern: true },
]) {
  test(`voice audio is decoded locally and streamed in ordered bounded PCM chunks (detached=${detached}, modern=${modern})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 700 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await openVoice(page, detached, true, modern);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin')
            .length,
      ),
    ).toBe(0);
    await page.getByRole('button', { name: 'Translate voice note', exact: true }).click();
    await page.waitForFunction(() =>
      (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
    );
    const chunks = await page.evaluate(() =>
      (window as unknown as VoiceFixture).requests
        .filter((r): r is Extract<PageRequest, { type: 'voice_audio' }> => r.type === 'voice_audio')
        .map((r) => ({ index: r.index, size: atob(r.pcm).length })),
    );
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
    expect(chunks.reduce((size, chunk) => size + chunk.size, 0)).toBe(32000);
    expect(chunks.every((c) => c.size <= 16384)).toBe(true);
    await page.evaluate(() => (window as unknown as VoiceFixture).completeVoice());
    await expect(page.locator('.wisp-voice-output')).toContainText('Tomorrow at the park.');
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(page.locator('.wisp-voice-original')).toContainText('Mañana en el parque.');
    await expect(page.locator('.wisp-voice-select option[value=yue]')).toHaveJSProperty(
      'disabled',
      true,
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (detached) await page.screenshot({ path: 'target/browser-tests/voice-note.png' });
    await page.getByRole('button', { name: 'Voice-note options' }).click();
    await page.getByLabel('Voice-note source language').selectOption('es');
    await page.getByRole('button', { name: 'Transcribe again', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as VoiceFixture).requests.findLast(
              (r): r is Extract<PageRequest, { type: 'voice_begin' }> => r.type === 'voice_begin',
            )?.language,
        ),
      )
      .toBe('es');
  });
}

test('optional model setup waits for readiness before starting the clicked recording', async ({
  page,
}) => {
  await openVoice(page, true, false);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'speech_download')
          .length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Enable voice translation' }).click();
  await page.evaluate(() => (window as unknown as VoiceFixture).configureVoice(true, false));
  await expect(page.locator('.wisp-voice-status')).toContainText('25%');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin').length,
    ),
  ).toBe(0);
  await page.evaluate(() => (window as unknown as VoiceFixture).configureVoice(true, true));
  await page.waitForFunction(() =>
    (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
  );
  await page.evaluate(() => (window as unknown as VoiceFixture).completeVoice());
  await expect(page.locator('.wisp-voice-output')).toContainText('Tomorrow at the park.');
});

for (const layout of ['block', 'flex'] as const) {
  test(`voice helpers wrap without widening a native ${layout} bubble`, async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await openVoice(page, true, false, true, layout);
    const original = await page.evaluate(() => (window as unknown as VoiceFixture).nativeWidth);
    async function dimensions() {
      return page.evaluate(() => ({
        bubble: document.querySelector('.voice-body')!.getBoundingClientRect().width,
        player: document.querySelector('[data-testid=audio-player]')!.getBoundingClientRect().width,
      }));
    }
    async function fits(expected: typeof original) {
      await expect.poll(dimensions).toEqual(expected);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const panel = document.querySelector<HTMLElement>('.wisp-voice')!,
              status = document.querySelector<HTMLElement>('.wisp-voice-status')!;
            return (
              panel.scrollWidth <= panel.clientWidth + 1 &&
              status.scrollWidth <= status.clientWidth + 1
            );
          }),
        )
        .toBe(true);
    }
    await fits(original);
    await expect(page.locator('.wisp-voice-start')).toHaveAttribute('title', /465 MB/);
    await page.evaluate(() => (window as unknown as VoiceFixture).configureVoice(true, true));
    await fits(original);
    await page.getByRole('button', { name: 'Translate voice note', exact: true }).click();
    await page.waitForFunction(() =>
      (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
    );
    await page.evaluate(() =>
      (window as unknown as VoiceFixture).completeVoice(
        'A long translation with details. '.repeat(20) +
          'https://example.com/' +
          'long-path'.repeat(30),
        'Transcripción original. '.repeat(30),
      ),
    );
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await fits(original);
    await page.screenshot({ path: `target/browser-tests/voice-wrap-${layout}.png` });
    await page.setViewportSize({ width: 310, height: 800 });
    await page.evaluate(() => (window as unknown as VoiceFixture).configureChat(false));
    await expect(page.locator('.wisp-voice')).toHaveCount(0);
    const narrow = await dimensions();
    await page.evaluate(() => (window as unknown as VoiceFixture).configureChat(true));
    await expect(page.locator('.wisp-voice')).toBeVisible();
    await fits(narrow);
  });
}

test('inline automatic translation matches the native surface and restores without audio on return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 700 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openVoice(page, true, true, true, 'flex', true);
  await page.waitForFunction(() =>
    (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
  );
  await page.evaluate(() => (window as unknown as VoiceFixture).completeVoice());
  await expect(page.locator('.wisp-voice-output')).toContainText('Tomorrow at the park.');
  await expect(page.getByRole('button', { name: 'Original', exact: true })).toBeVisible();
  await expect(page.locator('.wisp-voice-start')).toBeHidden();
  await expect(page.locator('.wisp-voice-select')).toBeHidden();
  expect(
    await page.locator('.voice-body').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(32, 44, 51)');
  expect(
    await page.locator('.wisp-voice-content').evaluate((el) => getComputedStyle(el).borderWidth),
  ).toBe('0px');
  const begins = await page.evaluate(
    () =>
      (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin').length,
  );
  await page.evaluate(() => (window as unknown as VoiceFixture).configureChat(false));
  await expect(page.locator('.wisp-voice')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as VoiceFixture).configureChat(true));
  await expect(page.locator('.wisp-voice-output')).toContainText('Tomorrow at the park.');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin').length,
    ),
  ).toBe(begins);
  await page.screenshot({ path: 'target/browser-tests/voice-inline.png' });
});

test('Original and options fit a small viewport and escape a clipped message container', async ({
  page,
}) => {
  await page.setViewportSize({ width: 310, height: 380 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openVoice(page, true);
  await page.getByRole('button', { name: 'Translate voice note', exact: true }).click();
  await page.waitForFunction(() =>
    (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
  );
  await page.evaluate(() =>
    (window as unknown as VoiceFixture).completeVoice(
      'Tomorrow at the park.',
      'Original transcript. '.repeat(100),
    ),
  );
  await page
    .locator('.message-in')
    .evaluate((el) => ((el as HTMLElement).style.overflow = 'hidden'));
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.wisp-voice-original')).toBeVisible();
  await page.screenshot({ path: 'target/browser-tests/voice-original.png' });
  const original = await page.locator('.wisp-voice-original').boundingBox();
  expect(original!.x).toBeGreaterThanOrEqual(11);
  expect(original!.x + original!.width).toBeLessThanOrEqual(299);
  expect(original!.y).toBeGreaterThanOrEqual(11);
  expect(original!.y + original!.height).toBeLessThanOrEqual(369);
  expect(
    await page.locator('.wisp-voice-original').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.getByRole('button', { name: 'Voice-note options' }).click();
  await expect(page.locator('.wisp-voice-original')).toBeHidden();
  await expect(page.locator('.wisp-voice-options')).toBeVisible();
  const options = await page.locator('.wisp-voice-options').boundingBox();
  expect(options!.x).toBeGreaterThanOrEqual(11);
  expect(options!.y + options!.height).toBeLessThanOrEqual(369);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wisp-voice-options')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Voice-note options' })).toBeFocused();
});

test('voice surfaces and open Original popovers follow live WhatsApp theme changes without reopening the chat', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openVoice(page, true, true, true);
  await page.addStyleTag({
    content:
      'body.light{background:#fff;color:#111}body.light .voice-body{background:#fff;color:#111}',
  });
  await page.getByRole('button', { name: 'Translate voice note', exact: true }).click();
  await page.waitForFunction(() =>
    (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
  );
  await page.evaluate(() => (window as unknown as VoiceFixture).completeVoice());
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.evaluate(() => document.body.classList.add('light'));
  await expect
    .poll(() => page.locator('.voice-body').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  expect(
    await page.locator('.wisp-voice-original').evaluate((el) => ({
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
    })),
  ).toEqual({ color: 'rgb(17, 17, 17)', background: 'rgb(255, 255, 255)' });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.wispTheme))
    .toBe('light');
  await page.evaluate(() => document.body.classList.remove('light'));
  await expect
    .poll(() => page.locator('.voice-body').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(32, 44, 51)');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.wispTheme))
    .toBe('dark');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin').length,
    ),
  ).toBe(1);
});

test('the small collapse icon hides just the translation, leaving the player, Original, and saved result intact', async ({
  page,
}) => {
  await openVoice(page, true);
  await page.getByRole('button', { name: 'Translate voice note', exact: true }).click();
  await page.waitForFunction(() =>
    (window as unknown as VoiceFixture).requests.some((r) => r.type === 'voice_finish'),
  );
  await page.evaluate(() => (window as unknown as VoiceFixture).completeVoice());
  await page.getByRole('button', { name: 'Collapse voice translation' }).click();
  await expect(page.locator('.wisp-voice-output')).toBeHidden();
  await expect(page.locator('[data-testid=audio-player]')).toBeVisible();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.wisp-voice-original')).toContainText('Mañana en el parque.');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Expand voice translation' }).click();
  await expect(page.locator('.wisp-voice-output')).toContainText('Tomorrow at the park.');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as VoiceFixture).requests.filter((r) => r.type === 'voice_begin').length,
    ),
  ).toBe(1);
});
