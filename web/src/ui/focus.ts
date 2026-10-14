import { WhatsApp } from '../whatsapp';
import { UI } from './index';
import type { FocusTargets } from '../contracts';
let focused = false,
  previewUntil = 0,
  previous: FocusTargets | null = null;
let reportedFocus = false,
  reportedMain: HTMLElement | null = null,
  dispatchingResize = false,
  reflowFrame: number | undefined;
const entries = new Map<HTMLElement, string[]>();
function restore() {
  const changed = entries.size > 0;
  for (const [node, classes] of entries) for (const name of classes) node.classList.remove(name);
  entries.clear();
  previous = null;
  if (changed) window.dispatchEvent(new Event('wisp-layout'));
}
function add(node: HTMLElement, classes: string[]) {
  entries.set(node, classes);
  classes.forEach((name) => node.classList.add(name));
}
function decorations(node: HTMLElement, classes: string[]) {
  const bounds = node.getBoundingClientRect();
  for (const pseudo of ['before', 'after']) {
    const style = getComputedStyle(node, '::' + pseudo),
      width = parseFloat(style.width),
      height = parseFloat(style.height);
    const stretched =
      style.position === 'absolute' && style.top !== 'auto' && style.bottom !== 'auto';
    if (style.content === 'none' || !(stretched || (height > 0 && height >= bounds.height * 0.6)))
      continue;
    if (width >= 0 && width <= 3) classes.push('wisp-focus-no-' + pseudo);
    else classes.push('wisp-focus-edges-' + pseudo);
  }
  return classes;
}
function same(nodes: HTMLElement[], other: HTMLElement[]) {
  return nodes.length === other.length && nodes.every((node, index) => node === other[index]);
}
function refresh() {
  const main = focused ? document.querySelector<HTMLElement>(WhatsApp.selectors.main) : null;
  const targets = WhatsApp.focusTargets(main);
  if (!targets) {
    restore();
    return;
  }
  if (
    previous?.common === targets.common &&
    same(previous.expanded, targets.expanded) &&
    same(previous.hidden, targets.hidden) &&
    same(previous.interior, targets.interior) &&
    same(previous.paint, targets.paint)
  ) {
    for (const [node, classes] of entries)
      for (const name of classes) if (!node.classList.contains(name)) node.classList.add(name);
    return;
  }
  restore();
  UI.install();
  for (const node of targets.expanded) {
    add(node, decorations(node, ['wisp-focus-chat']));
  }
  for (const node of targets.interior)
    add(node, decorations(node, ['wisp-focus-edges', 'wisp-focus-stretch']));
  for (const node of targets.paint) add(node, decorations(node, ['wisp-focus-edges']));
  add(targets.common, ['wisp-focus-layout']);
  for (const node of targets.hidden) add(node, ['wisp-focus-hidden']);
  previous = targets;
  window.dispatchEvent(new Event('wisp-layout'));
  notifyResize(main);
}
function notifyResize(main: HTMLElement | null) {
  if (reportedFocus === focused && reportedMain === main) return;
  reportedFocus = focused;
  reportedMain = main;
  cancelAnimationFrame(reflowFrame ?? 0);
  // WhatsApp caches positions from window resize as well as CSS layout.
  // Collapsing an in-page split does not itself resize the Chromium viewport.
  reflowFrame = requestAnimationFrame(() => {
    reflowFrame = undefined;
    dispatchingResize = true;
    window.dispatchEvent(new Event('resize'));
    dispatchingResize = false;
  });
}
function configure(value: boolean) {
  if (Date.now() < previewUntil && !!value !== focused) return;
  previewUntil = 0;
  focused = !!value;
  refresh();
  if (!focused) notifyResize(null);
}
function preview(value: boolean) {
  if (typeof value !== 'boolean') return;
  focused = value;
  previewUntil = Date.now() + 2000;
  refresh();
  if (!focused) notifyResize(null);
}
function cancel(value: boolean) {
  previewUntil = 0;
  focused = !!value;
  refresh();
  if (!focused) notifyResize(null);
}
// Qt can create Chromium with a small initial viewport before the first
// window layout. Recheck decoration sizes when that viewport settles.
window.addEventListener('resize', () => {
  if (focused && !dispatchingResize) {
    previous = null;
    refresh();
  }
});
function diagnostics() {
  const main = document.querySelector<HTMLElement>(WhatsApp.selectors.main),
    targets = WhatsApp.focusTargets(main);
  // Include wallpaper and separator siblings as well as the nodes we change.
  // Recording only our targets concealed layers outside the chat subtree.
  const candidates = new Set<HTMLElement>(
    [main, targets?.common, ...entries.keys()].filter((node): node is HTMLElement => !!node),
  );
  for (let node = main?.parentElement; node; node = node.parentElement) candidates.add(node);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      (node as Element).matches(
        '#pane-side, [data-testid="chat-list"], [data-id], [data-wisp], [contenteditable], img, svg, canvas, video, [role="dialog"]',
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node, count = 0; (node = walker.nextNode()) && count++ < 512;) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect(),
      style = getComputedStyle(node);
    if (
      style.backgroundImage !== 'none' ||
      (rect.height >= innerHeight * 0.25 && rect.width > 0) ||
      node.tagName === 'HEADER'
    )
      candidates.add(node);
  }
  const nodes = [...candidates].slice(0, 96);
  const metric = (value: string | number) =>
    Math.round((Number.parseFloat(String(value)) || 0) * 100) / 100;
  const bounds = (node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map(metric);
  };
  const path = (node: HTMLElement) => {
    const result = [];
    for (; node?.parentElement && node !== document.body; node = node.parentElement)
      result.unshift([...node.parentElement.children].indexOf(node));
    return result.join('.');
  };
  const fingerprint = (value: string) => {
    let hash = 2166136261;
    for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16);
  };
  return JSON.stringify({
    version: 2,
    focused,
    main: !!main,
    viewport: [innerWidth, innerHeight],
    nodes: nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        path: path(node),
        owned: entries.get(node) || [],
        box: bounds(node),
        display: style.display,
        position: style.position,
        inset: [style.left, style.right, style.top, style.bottom],
        transform: style.transform,
        borders: [metric(style.borderLeftWidth), metric(style.borderRightWidth)],
        background: bg(style),
        shadow: style.boxShadow !== 'none',
        before: edge('before'),
        after: edge('after'),
      };
      function bg(s: CSSStyleDeclaration) {
        return !s.backgroundImage || s.backgroundImage === 'none'
          ? null
          : {
              id: fingerprint(s.backgroundImage),
              size: s.backgroundSize,
              position: s.backgroundPosition,
              repeat: s.backgroundRepeat,
            };
      }
      function edge(pseudo: string) {
        const s = getComputedStyle(node, '::' + pseudo);
        return {
          present: s.content !== 'none',
          display: s.display,
          position: s.position,
          inset: [s.left, s.right, s.top, s.bottom],
          size: [metric(s.width), metric(s.height)],
          borders: [metric(s.borderLeftWidth), metric(s.borderRightWidth)],
          background: bg(s),
        };
      }
    }),
  });
}

export const FocusLayout = { configure, preview, cancel, refresh, diagnostics };
