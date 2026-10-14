export function textOf(element: (Node & ParentNode) | null) {
  if (!element) return '';
  const clone = element.cloneNode(true) as Node & ParentNode;
  clone
    .querySelectorAll<HTMLElement>('[data-wisp], [aria-hidden="true"]:not(img[alt])')
    .forEach((node) => node.remove());
  clone
    .querySelectorAll<HTMLImageElement>('img[alt]')
    .forEach((img) => img.replaceWith((clone.ownerDocument ?? document).createTextNode(img.alt)));
  let text = '';
  function read(node: Node) {
    if (node.nodeType === 3) {
      text += node.textContent ?? '';
      return;
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
  for (const child of clone.childNodes) read(child);
  return text.replace(/\u200b/g, '').trim();
}

export function utf8Limit(text: string, maxBytes: number) {
  let result = '',
    size = 0;
  const encoder = new TextEncoder();
  for (const point of text) {
    const bytes = encoder.encode(point).length;
    if (size + bytes > maxBytes) break;
    size += bytes;
    result += point;
  }
  return result;
}

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}
