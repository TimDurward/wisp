// This helper runs in MainWorld because WhatsApp owns detached Audio objects.
// It never accesses Qt, credentials, network APIs, transcripts or native files.
import { findVoicePlay, viewOnceSelector } from './whatsapp/voice-selectors';
import { selectors } from './whatsapp/selectors';
if (location.origin === 'https://web.whatsapp.com' && window === window.top) {
  const sources = new Map<string, WeakRef<HTMLMediaElement>>();
  let selected: { id: string; at: number } | null = null,
    overlapping = 0,
    lastSelection = 0,
    pending: { id: string; nonce: string; at: number } | null = null;
  const originalPlay = HTMLMediaElement.prototype.play;
  function expireSelection() {
    if (Date.now() - lastSelection >= 15000) {
      selected = null;
      overlapping = 0;
    }
  }
  function reply(url: string) {
    if (!pending) return;
    window.postMessage(
      { source: 'wisp-voice-source', nonce: pending.nonce, message_id: pending.id, url },
      location.origin,
    );
    pending = null;
  }
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const play = target?.closest('button, [role="button"]') || target;
      if (!play || play.closest('[data-wisp]')) return;
      const container = play.closest('[data-id]');
      const icon = container && findVoicePlay(container);
      if (!icon || !(play === icon || play.contains(icon) || icon.contains(play))) return;
      if (
        container &&
        !play.closest(selectors.quote) &&
        !container.querySelector(viewOnceSelector)
      ) {
        expireSelection();
        lastSelection = Date.now();
        if (selected || overlapping) {
          overlapping = overlapping ? overlapping + 1 : 2;
          selected = null;
          reply('');
          return;
        }
        selected = { id: container.getAttribute('data-id')!, at: Date.now() };
      }
    },
    true,
  );
  HTMLMediaElement.prototype.play = function () {
    const source = this.currentSrc || this.src;
    if (overlapping) {
      overlapping--;
      return originalPlay.call(this);
    }
    const selection = selected;
    selected = null;
    if (selection && Date.now() - selection.at < 15000 && source) {
      sources.set(selection.id, new WeakRef(this));
      while (sources.size > 64) sources.delete(sources.keys().next().value!);
    }
    if (!pending || pending.id !== selection?.id || selection.at < pending.at || !source)
      return originalPlay.call(this);
    // Loading a note through its own native player establishes the source.
    // Keep this one playback silent and pause after WhatsApp's handlers settle.
    const muted = this.muted;
    this.muted = true;
    reply(source);
    const playing = originalPlay.call(this);
    const restore = () =>
      window.setTimeout(() => {
        this.pause();
        this.muted = muted;
      }, 0);
    playing.then(restore, restore);
    return playing;
  };
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      data?.source !== 'wisp-voice-request' ||
      typeof data.nonce !== 'string'
    )
      return;
    if (data.action === 'cancel') {
      if (pending?.nonce === data.nonce) pending = null;
      return;
    }
    if (data.action !== 'load' || typeof data.message_id !== 'string') return;
    expireSelection();
    const container = [...document.querySelectorAll<HTMLElement>('[data-id]')].find(
      (node) => node.getAttribute('data-id') === data.message_id && !node.closest('[data-wisp]'),
    );
    if (!container || container.querySelector(viewOnceSelector)) return;
    pending = { id: data.message_id, nonce: data.nonce, at: Date.now() };
    const audio = sources.get(data.message_id)?.deref();
    if (audio?.currentSrc || audio?.src) {
      reply(audio.currentSrc || audio.src);
      return;
    }
    if (selected || overlapping) {
      reply('');
      return;
    }
    const icon = findVoicePlay(container),
      play = icon?.closest<HTMLElement>('button, [role="button"]') || icon;
    if (play) play.click();
    else reply('');
  });
}
