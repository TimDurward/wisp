import type { FocusTargets } from '../contracts';
export function focusTargets(main: HTMLElement | null): FocusTargets | null {
  const sidebar = document.querySelector<HTMLElement>('#pane-side, [data-testid="chat-list"]');
  if (!main || !sidebar || main.contains(sidebar) || sidebar.contains(main)) return null;
  let common = sidebar.parentElement;
  while (common && !common.contains(main)) common = common.parentElement;
  if (!common) return null;
  const branch = (node: HTMLElement) => {
    while (node.parentElement !== common) node = node.parentElement!;
    return node;
  };
  const chat = branch(main),
    list = branch(sidebar),
    hidden = [list],
    expanded = [],
    paint = [];
  for (let node: HTMLElement | null = main; node && node !== common; node = node.parentElement)
    expanded.push(node);
  const bounds = main.getBoundingClientRect();
  // Inner scroll panes and wallpaper layers can retain their own edge
  // decorations after the outer split layout has expanded. Limit inspection
  // to structural wrappers, never message bubbles or interactive overlays.
  const interior = new Set<HTMLElement>(),
    interiorHidden: HTMLElement[] = [];
  const candidates = new Set<HTMLElement>();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      (node as Element).matches(
        '[data-id], [data-wisp], header, footer, [role="dialog"], [contenteditable], img, svg, canvas, video',
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node, count = 0; (node = walker.nextNode()) && count++ < 256;)
    if (node instanceof HTMLElement) candidates.add(node);
  const header = main.querySelector<HTMLElement>('header');
  for (const node of candidates) {
    if (
      node.closest('[data-wisp], [data-id], header, footer, [role="dialog"]') ||
      node.matches('[contenteditable], button, [role="button"]')
    )
      continue;
    const rect = node.getBoundingClientRect();
    const tall = rect.height > 0 && rect.height >= bounds.height * 0.3;
    if (
      node.classList.contains('wisp-focus-hidden') ||
      (tall && rect.width > 0 && rect.width <= 3 && !node.children.length && node.tabIndex < 0)
    )
      interiorHidden.push(node);
    else if (rect.height >= bounds.height * 0.25 && rect.width >= bounds.width * 0.45)
      interior.add(node);
  }
  if (header) interior.add(header);
  for (const sibling of common.children) {
    if (!(sibling instanceof HTMLElement)) continue;
    if (sibling === chat || sibling === list || sibling.dataset.wisp) continue;
    if (sibling.classList.contains('wisp-focus-hidden')) {
      hidden.push(sibling);
      continue;
    }
    const rect = sibling.getBoundingClientRect();
    const navigation =
      sibling.matches('nav, [role="navigation"], [data-testid="navbar"]') ||
      sibling.querySelector<HTMLElement>('nav, [role="navigation"], [data-testid="navbar"]');
    const actions = sibling.querySelectorAll<HTMLElement>('button, [role="button"]').length >= 2;
    const tall = rect.height > 0 && rect.height >= bounds.height * 0.6;
    const narrowRail =
      rect.width > 0 &&
      rect.width <= 120 &&
      rect.right <= bounds.left &&
      (navigation || (tall && actions));
    const divider =
      sibling.matches(
        '[role="separator"][aria-orientation="vertical"], [data-testid="conversation-panel-separator"]',
      ) ||
      (rect.width > 0 &&
        rect.width <= 3 &&
        tall &&
        !sibling.children.length &&
        sibling.tabIndex < 0);
    if (narrowRail || divider) {
      hidden.push(sibling);
      continue;
    }
    // WhatsApp paints the split behind the live panels in separate absolute
    // sibling layers. Their old sidebar borders remain when #main expands.
    // Inspect only empty, non-interactive paint layers; keep their geometry
    // and wallpaper intact and remove just the vertical edge decorations.
    const position = getComputedStyle(sibling).position;
    const interactive =
      'header, footer, nav, a[href], button, input, textarea, select, [role="button"], [role="dialog"], [tabindex]:not([tabindex="-1"]), [contenteditable], [data-id], [data-wisp], .selectable-text';
    if (
      !['absolute', 'fixed'].includes(position) ||
      !tall ||
      rect.width < bounds.width * 0.45 ||
      sibling.matches(interactive) ||
      sibling.querySelector<HTMLElement>(interactive)
    )
      continue;
    const walker = document.createTreeWalker(
      sibling,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.nodeType === Node.TEXT_NODE
            ? NodeFilter.FILTER_ACCEPT
            : (node as Element).matches('svg, img, canvas, video')
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
      },
    );
    const wrappers = [sibling];
    let text = false,
      node,
      count = 0;
    while ((node = walker.nextNode()) && count++ < 128) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.trim()) {
          text = true;
          break;
        }
      } else if (node instanceof HTMLElement) wrappers.push(node);
    }
    if (text || node) continue;
    for (const node of wrappers) {
      const rect = node.getBoundingClientRect();
      if (
        node.matches('div, span') &&
        rect.height >= bounds.height * 0.6 &&
        rect.width >= bounds.width * 0.25
      )
        paint.push(node);
    }
  }
  return {
    common,
    expanded,
    hidden: [...hidden, ...interiorHidden],
    interior: [...interior],
    paint,
  };
}
