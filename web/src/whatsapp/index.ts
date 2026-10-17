import * as text from './text';
import * as messages from './messages';
import * as conversation from './conversation';
import * as composer from './composer';
import * as layout from './layout';
import * as voice from './voice';
import * as previews from './previews';
import { selectors } from './selectors';

export const WhatsApp = {
  selectors,
  ...text,
  ...messages,
  ...conversation,
  ...composer,
  ...layout,
  ...voice,
  ...previews,
};
