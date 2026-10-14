import css from '../styles.css';
export function install() {
  if (document.querySelector<HTMLElement>('style[data-wisp]')) return;
  const style = document.createElement('style');
  style.dataset.wisp = 'style';
  style.textContent = css;
  document.head.append(style);
}
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) {
  const el = document.createElement(tag);
  el.className = className;
  el.dataset.wisp = 'ui';
  if (text) el.textContent = text;
  return el;
}
export function button(text: string, action: () => void, className = '') {
  const el = element('button', className, text);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
}
