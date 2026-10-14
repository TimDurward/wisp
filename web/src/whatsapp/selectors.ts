export const selectors = {
  main: '#main, [data-testid="conversation-panel-wrapper"]',
  incoming: '.message-in',
  outgoing: '.message-out',
  message: '[data-id]',
  text: '.selectable-text',
  quote:
    '[data-testid="quoted-message"], [data-testid="quoted-message-container"], .quoted-mention',
  title:
    'header [data-testid="conversation-info-header-chat-title"], header [title], header [role="heading"]',
  composer: '[contenteditable="true"][role="textbox"]',
  selection: '#pane-side [aria-selected="true"], [data-testid="chat-list"] [aria-selected="true"]',
};
