export async function copy(text: string, target: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const selection = window.getSelection(),
      range = document.createRange();
    if (!selection) return false;
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}
