export function required<T>(value: T | null | undefined, description = 'fixture value'): T {
  if (value === null || value === undefined) throw new Error(`Missing ${description}`);
  return value;
}

export function element<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  return required(root.querySelector<T>(selector), `element: ${selector}`);
}

export function rect(bounds: Partial<DOMRect>): DOMRect {
  const x = bounds.x ?? bounds.left ?? 0;
  const y = bounds.y ?? bounds.top ?? 0;
  const width = bounds.width ?? 0;
  const height = bounds.height ?? 0;
  return {
    x,
    y,
    width,
    height,
    left: bounds.left ?? x,
    top: bounds.top ?? y,
    right: bounds.right ?? x + width,
    bottom: bounds.bottom ?? y + height,
    toJSON() {
      return { x, y, width, height };
    },
  };
}
