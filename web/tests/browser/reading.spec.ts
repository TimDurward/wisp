import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { NativeChannel, PageRequest } from '../../src/contracts';

function chatMarkup(messages: number) {
  return `<style>body{margin:0;font:14px sans-serif}#main{height:100vh;display:flex;flex-direction:column}header,footer{padding:16px}#history{overflow:auto;flex:1}.message-in{padding:16px;margin:10px;background:#e6f4ee;border-radius:8px;max-width:500px}</style><main id="main"><header><span title="Reading fixture">Reading fixture</span></header><section id="history">${Array.from({ length: messages }, (_, i) => `<div data-id="false_123@lid_MESSAGE${i}"><div class="message-in"><span class="selectable-text">Hola, este es un mensaje de prueba número ${i}. ¿Nos vemos mañana en el parque?</span></div></div>`).join('')}</section><footer><div contenteditable="true" role="textbox"></div></footer></main>`;
}

// Standalone so Playwright can serialize it into the page without imports.
function installReadingChannel(): NativeChannel {
  let deliver = (_: string) => {};
  let current: Extract<PageRequest, { type: 'active_conversation' }> | undefined;
  let completed = 0;
  const translated = new Set<string>();
  const native: NativeChannel = {
    translationEvent: {
      connect: (callback) => {
        deliver = callback;
      },
    },
    submit(payload) {
      const request = JSON.parse(payload) as PageRequest;
      const emit = (value: object) => queueMicrotask(() => deliver(JSON.stringify(value)));
      if (request.type === 'active_conversation') {
        current = request;
        emit({
          type: 'config',
          conversation: request.conversation,
          view_id: request.view_id,
          revision: 1,
          enabled: true,
          can_translate: true,
          history_revision: 1,
          reading_label: 'English',
          reply_label: 'Spanish',
          voice_enabled: false,
          view_preferences: {
            live_preview: false,
            include_sent: true,
            reading_view: 'translation_first',
          },
        });
      } else if (request.type === 'saved_messages') emit({ ...request, items: [] });
      else if (request.type === 'translate') {
        completed++;
        translated.add(request.message_id);
        emit({
          type: 'translation',
          request_id: request.request_id,
          conversation: request.conversation,
          view_id: current?.view_id,
          text: 'Hello, this is an example translation. See you tomorrow in the park.',
        });
      }
    },
  };
  window.qt = { webChannelTransport: {} };
  window.QWebChannel = class {
    constructor(_: unknown, ready: (value: { objects: { translation: NativeChannel } }) => void) {
      ready({ objects: { translation: native } });
    }
  };
  Object.defineProperty(window, 'completedTranslations', {
    configurable: true,
    get: () => completed,
  });
  Object.defineProperty(window, 'translatedMessageIds', {
    configurable: true,
    get: () => [...translated],
  });
  return native;
}

for (const contents of [false, true]) {
  test(`visible messages translate after scrolling and editing (display:contents=${contents})`, async ({
    page,
  }) => {
    await page.route('https://web.whatsapp.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: chatMarkup(100) + (contents ? '<style>[data-id]{display:contents}</style>' : ''),
      }),
    );
    await page.addInitScript(installReadingChannel);
    await page.goto('https://web.whatsapp.com/');
    await page.addScriptTag({
      path: fileURLToPath(new URL('../../dist/wisp.js', import.meta.url)),
    });
    await expect(page.locator('.wisp-inline').first()).toBeVisible();
    const target = page.locator('[data-id="false_123@lid_MESSAGE75"]');
    await target.locator('.message-in').scrollIntoViewIfNeeded();
    await expect(target.locator('.wisp-inline')).toBeVisible();
    const ids = await page.evaluate(() => Reflect.get(window, 'translatedMessageIds') as string[]);
    expect(ids).toContain('false_123@lid_MESSAGE75');
    expect(ids).not.toContain('false_123@lid_MESSAGE40');
    const before = await page.evaluate(
      () => Reflect.get(window, 'completedTranslations') as number,
    );
    await target.locator('.selectable-text').evaluate((node) => {
      node.textContent = 'Un mensaje editado.';
    });
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'completedTranslations') as number))
      .toBeGreaterThan(before);
    await expect(target.locator('.wisp-inline')).toBeVisible();
  });
}
