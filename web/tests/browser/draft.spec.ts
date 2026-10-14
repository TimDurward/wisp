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

for (const sizing of ['border-box', 'content-box']) {
  test(`link cards can arrive and disappear while translating a draft (${sizing})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 700 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await openChat(page);
    await page.addStyleTag({
      content: `body{background:#111b21;color:#edf5f2}footer{display:block;flex-shrink:0;padding:12px}#native-composer{display:flex;align-items:flex-end;gap:12px;padding:12px;height:54px;box-sizing:${sizing};background:#222;border-radius:16px}#native-composer button{flex-shrink:0}.native-field{display:flex;flex-direction:column;flex:1;min-width:0;gap:8px}[contenteditable]{white-space:pre-wrap;overflow-wrap:anywhere}#link-card{height:148px;flex-shrink:0;display:flex;align-items:center;gap:12px;background:#1b272d;border-radius:8px;overflow:hidden}#link-card img{width:100px;height:148px;object-fit:cover}#link-card div{min-width:0;overflow-wrap:anywhere}#link-card a{color:#95ddc6}`,
    });
    await page.evaluate(() => {
      const footer = document.querySelector('footer')!,
        input = footer.querySelector('[contenteditable]')!,
        send = footer.querySelector('button')!;
      const shell = document.createElement('div');
      shell.id = 'native-composer';
      const field = document.createElement('div');
      field.className = 'native-field';
      field.append(input);
      shell.append(field, send);
      footer.replaceChildren(shell);
    });
    const url = 'https://share.google/FixtureMap123?place=city%20park#entrance';
    const source = `Meet me here ${url} at 5.`,
      translation = `Nos vemos aquí ${url} a las 5.`;
    await page.getByRole('textbox').fill(source);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await page.evaluate((url) => {
      const card = document.createElement('article');
      card.id = 'link-card';
      card.innerHTML = `<img alt="Map" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='148'%3E%3Crect width='100' height='148' fill='%238ac4ce'/%3E%3C/svg%3E"><div><b>City Park</b><p>See more information about this place</p><a href="${url}">share.google</a></div>`;
      document.querySelector('.native-field')!.prepend(card);
      (document.querySelector('#native-composer') as HTMLElement).style.height = '210px';
    }, url);
    await page.evaluate((text) => (window as FixtureWindow).fixtureComplete(text), translation);
    await expect(page.locator('.wisp-preview-text a')).toHaveAttribute('href', url);
    await expect(page.locator('.wisp-preview-text')).toHaveText(translation);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const preview = document.querySelector('.wisp-composer')!.getBoundingClientRect(),
            card = document.querySelector('#link-card')!.getBoundingClientRect(),
            input = document.querySelector('[contenteditable]')!.getBoundingClientRect(),
            host = document.querySelector('#native-composer')!.getBoundingClientRect();
          return (
            preview.top >= host.top &&
            preview.bottom <= card.top + 1 &&
            card.bottom <= input.top &&
            input.bottom <= host.bottom + 1 &&
            preview.right <= host.right &&
            host.bottom <= innerHeight
          );
        }),
      )
      .toBe(true);
    await expect(page.getByRole('textbox')).toHaveText(source);
    expect(
      await page.evaluate(
        () =>
          (window as FixtureWindow).fixtureRequests.filter(
            (request) => request.type === 'translate' && request.purpose === 'reply',
          ).length,
      ),
    ).toBe(1);
    const expanded = await page.locator('#native-composer').boundingBox();
    expect(expanded).not.toBeNull();
    if (sizing === 'border-box')
      await page.screenshot({ path: 'target/browser-tests/link-preview.png' });
    await page
      .context()
      .route('https://share.google/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<p>Link destination fixture</p>' }),
      );
    const opened = page.waitForEvent('popup');
    await page.locator('.wisp-preview-text a').click();
    const destination = await opened;
    await expect(destination).toHaveURL(url);
    await destination.close();
    expect(page.url()).toBe('https://web.whatsapp.com/');
    await page.evaluate(() => {
      document.querySelector('#link-card')!.remove();
      (document.querySelector('#native-composer') as HTMLElement).style.height = '54px';
    });
    await expect
      .poll(async () => (await page.locator('#native-composer').boundingBox())!.height)
      .toBeLessThan(expanded!.height - 100);
    await page.getByRole('textbox').press('Enter');
    expect(await page.evaluate(() => (window as FixtureWindow).fixtureCommit())).toBe(true);
    await expect(page.getByRole('textbox')).toHaveText(translation);
    expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(0);
  });
}

test('pasting only a link leaves sending to WhatsApp without a translation round-trip', async ({
  page,
}) => {
  await openChat(page);
  const url = 'https://share.google/ExactPath?q=one%20two#entrance';
  await page.getByRole('textbox').fill(url);
  await expect(page.locator('.wisp-composer')).toBeHidden();
  await page.getByRole('textbox').press('Enter');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as FixtureWindow).fixtureRequests.filter(
          (request) =>
            request.type === 'edit_draft' ||
            (request.type === 'translate' && request.purpose === 'reply'),
        ).length,
    ),
  ).toBe(0);
});

test('long drafts wrap inside a split chat pane and keep Send visible after resizing and focusing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openChat(page);
  await page.addStyleTag({
    // Native nested flex items and preformatted editor spans deliberately have
    // no min-width or wrapping fixes; Wisp must keep them inside the chat.
    content: `body{background:#111b21;color:#edf5f2}#split{display:flex;width:100%;height:100vh}#pane-side{flex:0 0 40%;background:#161717}#main{flex:1}header{flex-shrink:0;padding:16px;box-sizing:border-box}footer{padding:12px;gap:0;flex-shrink:0}#native-composer{display:flex;align-items:flex-end;flex:1;gap:12px;padding:16px;box-sizing:border-box;background:#222;border-radius:16px}#native-composer button{flex-shrink:0}.native-field{display:flex;flex-direction:column;flex:1}[contenteditable],.native-editor-text{white-space:pre}#native-composer button{color:inherit;background:transparent;border:0;padding:8px}`,
  });
  const source =
      'Hola Milagros, it is Timothy and Liliana. We wanted to check when you expect to send us the photos for our family. Please let us know when you have a chance. Thank you!',
    url = `https://example.com/photos/${'family-album-'.repeat(20)}?view=original`,
    translated =
      'Hola Milagros, somos Timothy y Liliana. Queríamos saber cuándo nos enviarás las fotos para nuestra familia. Por favor, avísanos cuando tengas oportunidad. ¡Gracias!';
  await page.evaluate(() => {
    const main = document.querySelector('#main')!,
      footer = main.querySelector('footer')!,
      input = footer.querySelector('[contenteditable]')!,
      send = footer.querySelector('button')!;
    const split = document.createElement('div');
    split.id = 'split';
    const sidebar = document.createElement('aside');
    sidebar.id = 'pane-side';
    sidebar.textContent = 'WhatsApp chats';
    main.before(split);
    split.append(sidebar, main);
    const shell = document.createElement('div');
    shell.id = 'native-composer';
    const field = document.createElement('div');
    field.className = 'native-field';
    field.append(input);
    shell.append(field, send);
    footer.replaceChildren(shell);
  });
  async function expectContained() {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const main = document.querySelector('#main')!.getBoundingClientRect(),
            input = document.querySelector<HTMLElement>('[contenteditable]')!,
            preview = document.querySelector<HTMLElement>('.wisp-preview-text')!,
            send = document.querySelector('[aria-label="Send"]')!.getBoundingClientRect(),
            inputBox = input.getBoundingClientRect(),
            panel = document.querySelector('.wisp-composer')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(input);
          const lines = [...range.getClientRects()];
          // pre-wrap may hang trailing whitespace outside a line's box.
          // Check visible words separately so those spaces aren't overflow.
          const words: DOMRect[] = [],
            walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
          for (let node; (node = walker.nextNode());) {
            for (const word of (node.textContent || '').matchAll(/\S+/g)) {
              range.setStart(node, word.index);
              range.setEnd(node, word.index + word[0].length);
              words.push(...range.getClientRects());
            }
          }
          return {
            main: main.right <= innerWidth + 1,
            send: send.right <= main.right && send.left >= main.left,
            input: inputBox.right <= main.right && inputBox.left >= main.left,
            panel: panel.right <= main.right && panel.left >= main.left,
            nativeOverflow: input.scrollWidth <= input.clientWidth + 1,
            previewOverflow: preview.scrollWidth <= preview.clientWidth + 1,
            wrapped: new Set(lines.map((line) => line.top)).size > 1,
            text: words.every((word) => word.right <= inputBox.right + 1),
            page: document.documentElement.scrollWidth <= innerWidth,
          };
        }),
      )
      .toEqual({
        main: true,
        send: true,
        input: true,
        panel: true,
        nativeOverflow: true,
        previewOverflow: true,
        wrapped: true,
        text: true,
        page: true,
      });
  }
  async function translate(text: string, output: string) {
    await page.getByRole('textbox').fill(text);
    // WhatsApp also nests preformatted spans when pasting. Keep that shape
    // without replacing the editor or its native handlers.
    await page.evaluate(() => {
      const input = document.querySelector('[contenteditable]')!,
        span = document.createElement('span');
      span.className = 'native-editor-text';
      span.textContent = input.textContent;
      input.replaceChildren(span);
    });
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await page.evaluate((text) => (window as FixtureWindow).fixtureComplete(text), output);
    await expect(page.locator('.wisp-preview-text')).toHaveText(output);
  }
  await translate(source, translated);
  await expectContained();
  await page.screenshot({ path: 'target/browser-tests/composer-wrap.png' });
  await page.setViewportSize({ width: 960, height: 660 });
  await expectContained();
  await translate(`${source}\nSee ${url}`, `${translated}\nMira ${url}`);
  await expectContained();
  for (const focus of [true, false]) {
    await page.evaluate(
      (focus) =>
        (window as FixtureWindow).fixtureEmit({
          type: 'config',
          conversation: 'fixture-chat',
          enabled: true,
          revision: 1,
          view_preferences: { focus_chat: focus, live_preview: false },
        }),
      focus,
    );
    await expect(page.locator('#pane-side')).toBeVisible({ visible: !focus });
    await expectContained();
  }
  await page.getByRole('textbox').press('Enter');
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureCommit())).toBe(true);
  await expect(page.getByRole('textbox')).toHaveText(`${translated}\nMira ${url}`);
  await expectContained();
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureSends)).toBe(0);
  // A pure URL still wraps even though there is no translation preview.
  await page.getByRole('textbox').fill(url);
  await expect(page.locator('.wisp-composer')).toBeHidden();
  await expect
    .poll(() =>
      page.getByRole('textbox').evaluate((input) => input.scrollWidth <= input.clientWidth + 1),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as FixtureWindow).fixtureEmit({
      type: 'config',
      conversation: 'fixture-chat',
      revision: 2,
      enabled: false,
    }),
  );
  await expect(page.locator('.wisp-composer')).toHaveCount(0);
  await expect(page.locator('[class*="wisp-compose-"]')).toHaveCount(0);
  expect(
    await page.getByRole('textbox').evaluate((input) => getComputedStyle(input).whiteSpace),
  ).toBe('pre');
});
