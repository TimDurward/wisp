import { expect, test } from 'vitest';
import { links, onlyLinks } from '../src/links';
import { linkedText } from '../src/ui/links';
import { setup } from './support/harness';

test('URL recognition preserves Unicode, queries, fragments and balanced punctuation', () => {
  const text = '(https://example.com/Place_(park)?q=é#入口). www.example.org/a!';
  expect(links(text).map((link) => link.url)).toEqual([
    'https://example.com/Place_(park)?q=é#入口',
    'www.example.org/a',
  ]);
  expect(onlyLinks(text)).toBe(true);
  expect(onlyLinks('Meet me ' + text)).toBe(false);
  expect(onlyLinks('javascript:alert(1)')).toBe(false);
  expect(onlyLinks('https://')).toBe(false);
  expect(links("https://en.wikipedia.org/wiki/D'Angelo")[0]?.url).toBe(
    "https://en.wikipedia.org/wiki/D'Angelo",
  );
});

test('linked text remains literal and only web URLs become safe, clickable anchors', () => {
  const app = setup();
  try {
    const body = app.w.document.createElement('div');
    const text =
      '<img src=x onerror="alert(1)"> Go to https://example.com/a?x=1#here. javascript:alert(1)';
    linkedText(body, text);
    expect(body.textContent).toBe(text);
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelectorAll('a').length).toBe(1);
    const anchor = body.querySelector('a')!;
    expect(anchor.getAttribute('href')).toBe('https://example.com/a?x=1#here');
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toBe('noopener noreferrer');
  } finally {
    app.dom.window.close();
  }
});
