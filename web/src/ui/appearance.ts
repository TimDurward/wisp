const listeners = new Set<() => void>();
let refresh: (() => void) | undefined;

export function opaqueColor(color: string) {
  return !!color && color !== 'transparent' && !/^rgba\([^)]*,\s*0\s*\)$/.test(color);
}
function nativeDark(): boolean | null {
  const rootStyle = getComputedStyle(document.documentElement);
  const incoming = rootStyle.getPropertyValue('--incoming-background').trim();
  // Header colors belong to WhatsApp and are never painted by Wisp.
  let node: HTMLElement | null = document.querySelector('#main header') || document.body;
  let color = incoming;
  while (!opaqueColor(color) && node) {
    color = getComputedStyle(node).backgroundColor;
    node = node.parentElement;
  }
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
  if (rgb) return +rgb[1]! * 0.2126 + +rgb[2]! * 0.7152 + +rgb[3]! * 0.0722 < 128;
  if (/^#[\da-f]{3}$/i.test(color))
    color = '#' + [...color.slice(1)].map((value) => value + value).join('');
  if (/^#[\da-f]{6}$/i.test(color)) {
    const values = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722 < 128;
  }
  return null;
}
export function watchAppearance(report: (dark: boolean) => void) {
  const lifecycle = new AbortController(),
    media = matchMedia('(prefers-color-scheme: dark)');
  let timer: number | undefined, last: boolean | undefined;
  function update() {
    timer = undefined;
    const detected = nativeDark();
    const dark = detected ?? media.matches;
    document.documentElement.dataset.wispTheme = dark ? 'dark' : 'light';
    if (detected !== null && last !== dark) {
      last = dark;
      report(dark);
    }
    for (const listener of listeners) listener();
  }
  function schedule() {
    if (!timer) timer = window.setTimeout(update, 32);
  }
  const roots = new MutationObserver(schedule);
  function observeRoots() {
    roots.disconnect();
    const options = {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'],
    };
    roots.observe(document.documentElement, options);
    roots.observe(document.body, options);
    for (const node of document.body.children)
      if (node instanceof HTMLElement && !node.dataset.wisp) roots.observe(node, options);
  }
  const body = new MutationObserver(() => {
    observeRoots();
    schedule();
  });
  body.observe(document.body, { childList: true });
  const styles = new MutationObserver((changes) => {
    if (
      changes.some(
        (change) =>
          !(
            change.target instanceof Element ? change.target : change.target.parentElement
          )?.closest('[data-wisp]'),
      )
    )
      schedule();
  });
  styles.observe(document.head, { childList: true, subtree: true, characterData: true });
  media.addEventListener('change', schedule, { signal: lifecycle.signal });
  window.addEventListener('pageshow', schedule, { signal: lifecycle.signal });
  observeRoots();
  refresh = schedule;
  update();
  return () => {
    roots.disconnect();
    body.disconnect();
    styles.disconnect();
    lifecycle.abort();
    window.clearTimeout(timer);
    refresh = undefined;
    delete document.documentElement.dataset.wispTheme;
  };
}
export function onAppearanceChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function refreshAppearance() {
  refresh?.();
}
