import { element, install } from './dom';

export function chatPreview(source: HTMLElement, text: string, original: string) {
  install();
  const preview = element('span', 'wisp-chat-preview', text.replace(/\s+/g, ' ').trim());
  preview.dir = 'auto';
  preview.title = original;
  source.classList.add('wisp-chat-preview-original');
  source.after(preview);
  return () => {
    preview.remove();
    source.classList.remove('wisp-chat-preview-original');
  };
}
