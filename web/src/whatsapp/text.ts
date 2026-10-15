export function textOf(element: (Node & ParentNode) | null) {
  if (!element) return '';
  let text = '';
  function read(node: Node) {
    if (node.nodeType === 3) {
      text += node.textContent ?? '';
      return;
    }
    if (node instanceof Element) {
      if (node.hasAttribute('data-wisp')) return;
      const image = node.nodeName === 'IMG' && node.hasAttribute('alt');
      if (node.getAttribute('aria-hidden') === 'true' && !image) return;
      if (image) {
        text += node.getAttribute('alt') || '';
        return;
      }
    }
    if (node.nodeName === 'BR') {
      text += '\n';
      return;
    }
    const block = ['DIV', 'P', 'LI'].includes(node.nodeName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    for (const child of node.childNodes) read(child);
    if (block && text && !text.endsWith('\n')) text += '\n';
  }
  // Read the native message without cloning its entire subtree on every scan.
  // Skipping Wisp/hidden descendants preserves the same source-text boundary.
  for (const child of element.childNodes) read(child);
  return text.replace(/\u200b/g, '').trim();
}

export function utf8Limit(text: string, maxBytes: number) {
  let end = 0,
    size = 0;
  for (const point of text) {
    const code = point.codePointAt(0)!;
    const bytes = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (size + bytes > maxBytes) break;
    size += bytes;
    end += point.length;
  }
  return text.slice(0, end);
}

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}
