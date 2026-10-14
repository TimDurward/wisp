import { createElement, ChevronUp, Ellipsis, Mic } from 'lucide';
export function icon(name: 'collapse' | 'options' | 'microphone') {
  return createElement({ collapse: ChevronUp, options: Ellipsis, microphone: Mic }[name], {
    width: 14,
    height: 14,
    'stroke-width': 1.5,
    'aria-hidden': 'true',
  });
}
