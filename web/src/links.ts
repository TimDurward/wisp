export interface TextLink {
  start: number;
  end: number;
  url: string;
  href: string;
}

export function links(text: string): TextLink[] {
  const result: TextLink[] = [];
  for (const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"]+/gi)) {
    let url = match[0].replace(/[.,!?;:'…。！？、]+$/u, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ] as const) {
      while (url.endsWith(close) && url.split(close).length > url.split(open).length)
        url = url.slice(0, -1);
    }
    const href = /^www\./i.test(url) ? 'https://' + url : url;
    try {
      const parsed = new URL(href);
      if (!parsed.hostname || !['https:', 'http:'].includes(parsed.protocol)) continue;
      result.push({ start: match.index, end: match.index + url.length, url, href });
    } catch {
      // Incomplete URLs stay ordinary text while a draft is being typed.
    }
  }
  return result;
}

export function onlyLinks(text: string) {
  const found = links(text);
  if (!found.length) return false;
  let remainder = '',
    end = 0;
  for (const link of found) {
    remainder += text.slice(end, link.start);
    end = link.end;
  }
  remainder += text.slice(end);
  return !remainder.replace(/[\s.,!?;:'"()\[\]{}<>…。！？、]/gu, '');
}
