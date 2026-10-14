import { test, expect, type Page } from '@playwright/test';
import type { NativeEdit, PageRequest, TranslationEvent } from '../../src/contracts';
import { fileURLToPath } from 'node:url';

declare global {
  interface Window {
    fixtureRequests: PageRequest[];
    fixtureEmit: (event: unknown) => void;
    fixtureComplete: (text: string) => void;
    fixtureCommit: () => boolean;
    fixtureSends: number;
  }
}
type FixtureWindow = Window;

async function openChat(page: Page, opaque = false) {
  const id = opaque ? '3EB0A123456789ABCDEF0123456789AB' : 'false_123@lid_ONE';
  await page.route('https://web.whatsapp.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body{margin:0;font:14px sans-serif}#main{height:100vh;display:flex;flex-direction:column}header{height:60px}.message-in{padding:20px;flex:1}footer{padding:20px;display:flex;gap:20px}[contenteditable]{flex:1;min-height:30px}</style><main id="main"><header><span title="Fixture">Fixture</span></header><div class="message-in" data-id="${id}"><span class="selectable-text">Hola</span></div><footer><div contenteditable="true" role="textbox">See you soon</div><button aria-label="Send">Send</button></footer></main>`,
    }),
  );
  await page.addInitScript(() => {
    const w = window as FixtureWindow;
    w.fixtureRequests = [];
    w.fixtureSends = 0;
    const translations = new Map<string, string>();
    w.qt = { webChannelTransport: {} };
    w.QWebChannel = class {
      constructor(
        _transport: unknown,
        ready: (channel: {
          objects: {
            translation: {
              submit: (payload: string) => void;
              translationEvent: { connect: (callback: (payload: string) => void) => void };
            };
          };
        }) => void,
      ) {
        ready({
          objects: {
            translation: {
              submit(payload) {
                const request = JSON.parse(payload) as PageRequest;
                w.fixtureRequests.push(request);
                if (request.type === 'saved_messages')
                  queueMicrotask(() => w.fixtureEmit({ ...request, items: [] }));
              },
              translationEvent: {
                connect(callback) {
                  w.fixtureEmit = (event) => {
                    const value = event as TranslationEvent;
                    if (value.type === 'translation')
                      translations.set(value.request_id, value.text);
                    const current = w.fixtureRequests.findLast(
                      (request) => request.type === 'active_conversation',
                    );
                    callback(
                      JSON.stringify({
                        view_id: current?.view_id,
                        view_preferences: { live_preview: false },
                        ...(event as object),
                      }),
                    );
                  };
                },
              },
            },
          },
        });
      }
    };
    w.fixtureComplete = (text) => {
      const request = w.fixtureRequests.findLast(
        (request): request is Extract<PageRequest, { type: 'translate' }> =>
          request.type === 'translate' && request.purpose === 'reply',
      );
      if (!request || request.type !== 'translate') throw new Error('No draft request');
      w.fixtureEmit({
        type: 'translation',
        request_id: request.request_id,
        conversation: request.conversation,
        text,
      });
    };
    w.fixtureCommit = () => {
      const edit = w.fixtureRequests.findLast((request) => request.type === 'edit_draft');
      if (!edit || edit.type !== 'edit_draft' || !w.__wispDraftEditing) return false;
      const reply = w.fixtureRequests.find(
        (request) => request.type === 'translate' && request.request_id === edit.ticket,
      );
      const text =
        edit.restore && reply?.type === 'translate' ? reply.text : translations.get(edit.ticket);
      if (text === undefined || !w.__wispDraftEditing.begin({ ...edit, text } satisfies NativeEdit))
        return false;
      const input = document.activeElement;
      if (!(input instanceof HTMLElement)) return false;
      const range = document.createRange();
      range.selectNodeContents(input);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      if (!w.__wispDraftEditing.selected(edit.edit_id)) return false;
      input.textContent = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      w.__wispDraftEditing.settle(edit.edit_id, true);
      return true;
    };
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('[contenteditable]')?.addEventListener('keydown', (event) => {
        const key = event as KeyboardEvent;
        if (key.key === 'Enter' && !key.shiftKey && !key.defaultPrevented) {
          w.fixtureSends++;
          (key.target as HTMLElement).replaceChildren();
        }
      });
      document
        .querySelector('[aria-label="Send"]')
        ?.addEventListener('click', () => w.fixtureSends++);
    });
  });
  await page.goto('https://web.whatsapp.com/');
  await page.addScriptTag({ path: fileURLToPath(new URL('../../dist/wisp.js', import.meta.url)) });
  await page.waitForFunction(() =>
    (window as FixtureWindow).fixtureRequests.some(
      (request) => request.type === 'active_conversation' && request.message_ids.length > 0,
    ),
  );
  await page.evaluate(() =>
    (window as FixtureWindow).fixtureEmit({
      type: 'config',
      conversation: 'fixture-chat',
      revision: 1,
      enabled: true,
    }),
  );
  await expect(page.locator('.wisp-preview-button')).toBeVisible();
}

test('Enter waits for completed output, prepares through the native handshake, and leaves sending to WhatsApp', async ({
  page,
}) => {
  await openChat(page);
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await page.getByRole('textbox').press('Enter');
  expect(
    await page.evaluate(
      () =>
        (window as FixtureWindow).fixtureRequests.filter((request) => request.type === 'edit_draft')
          .length,
    ),
  ).toBe(0);
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(0);
  await page.evaluate(() => (window as FixtureWindow).fixtureComplete('Nos vemos pronto'));
  await expect(page.locator('.wisp-prepare')).toBeEnabled();
  await page.getByRole('textbox').press('Enter');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureCommit())).toBe(true);
  await expect(page.getByRole('textbox')).toHaveText('Nos vemos pronto');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(0);
  await page.getByRole('textbox').press('Enter');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(1);
});

test('Shift+Enter retains multiline text and clicking Send prepares before the next manual click sends', async ({
  page,
}) => {
  await openChat(page);
  const input = page.getByRole('textbox');
  await input.fill('Hello');
  await input.press('Shift+Enter');
  await input.pressSequentially('How are you?');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as FixtureWindow).fixtureRequests.findLast(
          (request): request is Extract<PageRequest, { type: 'translate' }> =>
            request.type === 'translate' && request.purpose === 'reply',
        )?.text,
    ),
  ).toBe('Hello\nHow are you?');
  await page.evaluate(() => (window as FixtureWindow).fixtureComplete('Hola\n¿Cómo estás?'));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureCommit())).toBe(true);
  await expect(input).toHaveText('Hola\n¿Cómo estás?');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(0);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(1);
});

test('a trusted history scroll retains the view through a loading gap and disjoint opaque message IDs', async ({
  page,
}) => {
  await openChat(page, true);
  const view = await page.evaluate(
    () =>
      (window as FixtureWindow).fixtureRequests.findLast(
        (request) => request.type === 'active_conversation',
      )?.view_id,
  );
  await page.locator('.message-in').hover();
  await page.mouse.wheel(0, -400);
  await page.evaluate(() => document.querySelector('[data-id]')?.remove());
  await page.evaluate(() =>
    document
      .querySelector('footer')
      ?.insertAdjacentHTML(
        'beforebegin',
        '<div class="message-in" data-id="3EB0B123456789ABCDEF0123456789AB"><span class="selectable-text">Older message</span></div>',
      ),
  );
  await page.waitForFunction(() =>
    (window as FixtureWindow).fixtureRequests.some(
      (request) =>
        request.type === 'active_conversation' &&
        request.message_ids.includes('3EB0B123456789ABCDEF0123456789AB'),
    ),
  );
  expect(
    await page.evaluate(
      () =>
        (window as FixtureWindow).fixtureRequests.findLast(
          (request) => request.type === 'active_conversation',
        )?.view_id,
    ),
  ).toBe(view);
});
