import { links } from '../links';

export function linkedText(target: HTMLElement, text: string) {
  const doc = target.ownerDocument,
    content = doc.createDocumentFragment();
  let end = 0;
  for (const link of links(text)) {
    content.append(doc.createTextNode(text.slice(end, link.start)));
    const anchor = doc.createElement('a');
    anchor.textContent = link.url;
    anchor.setAttribute('href', link.href);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    content.append(anchor);
    end = link.end;
  }
  content.append(doc.createTextNode(text.slice(end)));
  target.replaceChildren(content);
}
