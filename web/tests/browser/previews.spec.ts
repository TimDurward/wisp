import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { NativeChannel, PageRequest } from '../../src/contracts';

const source = 'Es para más personas y dura más';
const translation = 'It’s for more people and lasts longer. There are more details to discuss.';

function markup(dark: boolean) {
  return `<meta charset="utf-8"><style>
    body{margin:0;font:14px Arial,sans-serif;color:${dark ? '#e9edef' : '#111b21'};background:${dark ? '#161717' : '#fff'}}
    #split{display:flex;height:100vh}#pane-side{width:310px;flex-shrink:0;border-right:1px solid #8885;padding:12px;box-sizing:border-box}
    [role=listitem]{padding:12px;border-radius:12px;margin-bottom:8px;cursor:pointer}[aria-selected=true]{background:#8882}
    .primary,.secondary{display:flex;align-items:center;gap:5px;min-width:0}.primary{margin-bottom:8px}.name{flex:1;font-size:16px}
    .secondary{color:${dark ? '#aaa' : '#667781'}}.native-preview{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.unread{margin-left:auto;border-radius:20px;padding:2px 5px;background:#25d366;color:#111;font-size:11px}
    [data-icon]{color:#53bdeb;flex-shrink:0}#main{padding:24px;flex:1;min-width:0}.message-out{padding:16px;margin-top:20px;border-radius:12px;background:${dark ? '#144d37' : '#d9fdd3'}}footer{margin-top:24px;padding:16px;background:#8882;border-radius:12px}
    </style><div id="split"><aside id="pane-side"><h2>WhatsApp</h2>
    <div role="listitem" id="enabled" aria-selected="true"><div class="primary"><span title="Contact" class="name">Contact</span><small>6:07 PM</small></div>
    <div class="secondary"><span data-icon="status-dblcheck">✓✓</span><span title="${source}" class="native-preview" id="source">${source}</span><span class="unread">2</span></div></div>
    <div role="listitem" id="disabled" aria-selected="false"><div class="primary"><span title="Contact" class="name">Contact</span><small>6:12 PM</small></div><div class="secondary"><span title="${source}" class="native-preview">${source}</span></div></div></aside>
    <main id="main"><header><span title="Contact">Contact</span></header><div data-id="true_123@lid_MESSAGE"><div class="message-out"><span class="selectable-text">${source}</span></div></div><footer><div contenteditable="true" role="textbox"></div></footer></main></div>`;
}

function installChannel() {
  let deliver = (_: string) => {};
  let current: Extract<PageRequest, { type: 'active_conversation' }> | undefined;
  let translations = 0;
  let clicks = 0;
  const config = (enabled: boolean) => ({
    type: 'config',
    conversation: current?.conversation,
    view_id: current?.view_id,
    revision: enabled ? 1 : 2,
    enabled,
    can_translate: true,
    history_revision: 1,
    reading_language: 'english',
    reading_label: 'English',
    reply_language: 'spanish',
    reply_label: 'Spanish',
    view_preferences: {
      live_preview: false,
      include_sent: true,
      reading_view: 'translation_first',
    },
  });
  const native: NativeChannel = {
    translationEvent: {
      connect(callback) {
        deliver = callback;
      },
    },
    submit(payload) {
      const request = JSON.parse(payload) as PageRequest;
      const emit = (event: object) => queueMicrotask(() => deliver(JSON.stringify(event)));
      if (request.type === 'active_conversation') {
        current = request;
        emit(config(true));
      } else if (request.type === 'saved_messages') emit({ ...request, items: [] });
      else if (request.type === 'translate') {
        translations++;
        emit({
          type: 'translation',
          conversation: request.conversation,
          request_id: request.request_id,
          text: 'It’s for more people and lasts longer. There are more details to discuss.',
        });
      }
    },
  };
  window.qt = { webChannelTransport: {} };
  window.QWebChannel = class {
    constructor(_: unknown, ready: (channel: { objects: { translation: NativeChannel } }) => void) {
      ready({ objects: { translation: native } });
    }
  };
  document.addEventListener('click', (event) => {
    if ((event.target as Element).closest('#enabled')) clicks++;
  });
  Object.defineProperty(window, 'previewFixture', {
    value: {
      counts: () => ({ translations, clicks }),
      disable: () => deliver(JSON.stringify(config(false))),
    },
  });
}

for (const dark of [false, true]) {
  test(`sidebar translations preserve native layout and restore original text (dark=${dark})`, async ({
    page,
  }, testInfo) => {
    await page.route('https://web.whatsapp.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: markup(dark) }),
    );
    await page.addInitScript(installChannel);
    await page.goto('https://web.whatsapp.com/');
    const ticksBefore = await page.locator('[data-icon]').boundingBox();
    const unreadBefore = await page.locator('.unread').boundingBox();
    await page.addScriptTag({
      path: fileURLToPath(new URL('../../dist/wisp.js', import.meta.url)),
    });
    const preview = page.locator('#enabled .wisp-chat-preview');
    await expect(preview).toHaveText(translation);
    // Exercise a later debounced sidebar scan with the native source hidden.
    await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
    await page.waitForTimeout(240);
    await expect(preview).toBeVisible();
    await expect(page.locator('#source')).toBeHidden();
    await expect(page.locator('#disabled .wisp-chat-preview')).toHaveCount(0);
    await expect(page.locator('#disabled .native-preview')).toHaveText(source);
    await expect(preview).toHaveAttribute('title', source);
    const ticksAfter = await page.locator('[data-icon]').boundingBox();
    const unreadAfter = await page.locator('.unread').boundingBox();
    expect(ticksAfter?.x).toBe(ticksBefore?.x);
    expect(ticksAfter?.width).toBe(ticksBefore?.width);
    expect(unreadAfter?.x).toBe(unreadBefore?.x);
    expect(unreadAfter?.width).toBe(unreadBefore?.width);
    const dimensions = await preview.evaluate((node) => ({
      width: node.clientWidth,
      scroll: node.scrollWidth,
      overflow: getComputedStyle(node).textOverflow,
    }));
    expect(dimensions.scroll).toBeGreaterThan(dimensions.width);
    expect(dimensions.overflow).toBe('ellipsis');
    await page.screenshot({ path: testInfo.outputPath('sidebar-preview.png') });
    await preview.click();
    const counts = await page.evaluate(() =>
      (
        Reflect.get(window, 'previewFixture') as {
          counts(): { translations: number; clicks: number };
        }
      ).counts(),
    );
    expect(counts).toEqual({ translations: 1, clicks: 1 });
    await page.evaluate(() =>
      (Reflect.get(window, 'previewFixture') as { disable(): void }).disable(),
    );
    await expect(preview).toHaveCount(0);
    await expect(page.locator('#source')).toBeVisible();
    await expect(page.locator('#source')).toHaveText(source);
  });
}
