import { selectors } from './selectors';
export const voicePlaySelector =
  '[data-icon="audio-play"], [data-icon="audio-pause"], [data-icon="ptt-play"], [data-icon="ptt-pause"], [data-testid="audio-play"], [data-testid="ptt-play"], [data-testid="voice-message-play"], [aria-label="Play voice message"], [aria-label="Pause voice message"]';
export const voiceContainerSelector =
  '[data-testid="audio-player"], [data-testid="audio-message"], [data-testid="voice-message"], [data-testid="ptt"], [data-testid="ptt-container"]';
export const voiceMarkerSelector =
  voiceContainerSelector +
  ', [data-icon="ptt-incoming"], [data-icon="ptt-outgoing"], [data-icon="ptt-status"]';
const genericPlaySelector = '[data-icon="play"], [data-icon="pause"]';
export function findVoicePlay(container: Element) {
  const outsideQuote = (node: Element) => !node.closest(selectors.quote + ', [data-wisp]');
  const specific = [...container.querySelectorAll<HTMLElement>(voicePlaySelector)].find(
    outsideQuote,
  );
  if (specific) return specific;
  // Generic play icons also belong to videos. Require a voice-specific marker.
  if (![...container.querySelectorAll(voiceMarkerSelector)].some(outsideQuote)) return null;
  return (
    [...container.querySelectorAll<HTMLElement>(genericPlaySelector)].find(outsideQuote) || null
  );
}
export const viewOnceSelector =
  '[data-icon="view-once"], [data-icon="view-once-audio"], [data-testid="view-once-message"]';
