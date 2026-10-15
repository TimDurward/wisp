import type { Chat } from '../contracts';
import { selectors } from './selectors';
import { records, messages, conversationFromMessageId, messageId } from './messages';
import { utf8Limit } from './text';
import { composer } from './composer';
export function active(candidates?: readonly HTMLElement[]): Chat {
  const main = document.querySelector<HTMLElement>(selectors.main);
  if (!main)
    return {
      conversation: '',
      title: '',
      main: null,
      header: null,
      selection: null,
      messageIds: [],
      detection: 'no_chat',
    };
  const header = main.querySelector<HTMLElement>('header'),
    selection = document.querySelector<HTMLElement>(selectors.selection);
  const titleNode = main.querySelector<HTMLElement>(selectors.title);
  const title =
    utf8Limit((titleNode?.getAttribute('title') || titleNode?.textContent || '').trim(), 256) ||
    'Current chat';
  // Existing chats use message records, including media, stickers and voice notes.
  // Empty chats receive a view-bound native identity until their first message.
  const messageIds = [
    ...new Set(
      (candidates || records(main)).map((node) => node.getAttribute('data-id')!).filter(Boolean),
    ),
  ];
  const ids = [...new Set(messageIds.map(conversationFromMessageId).filter(Boolean))];
  if (ids.length > 1 || !messageIds.length)
    return {
      conversation: '',
      title,
      main,
      header,
      selection,
      messageIds: [],
      detection: ids.length
        ? 'ambiguous'
        : main.querySelector<HTMLElement>(
              `${selectors.incoming}, ${selectors.outgoing}, [data-pre-plain-text]`,
            )
          ? 'unsupported_messages'
          : header && composer(main)
            ? 'empty'
            : 'waiting_for_messages',
    };
  return {
    conversation: ids[0] || '',
    title,
    main,
    header,
    selection,
    messageIds: messageIds.slice(-64),
    detection: 'ready',
  };
}

export function diagnostics() {
  const chat = active();
  const records = chat.main ? [...chat.main.querySelectorAll<HTMLElement>(selectors.message)] : [];
  return JSON.stringify({
    detection: chat.detection,
    main: !!chat.main,
    messageRecords: records.length,
    recognizedRecords: records.filter((node) => messageId(node.getAttribute('data-id'))).length,
    addressRecords: records.filter((node) =>
      conversationFromMessageId(node.getAttribute('data-id')),
    ).length,
    textMessages: messages(chat.main).length,
    titlePresent: !!chat.main?.querySelector<HTMLElement>(selectors.title),
    composers: chat.main?.querySelectorAll<HTMLElement>(selectors.composer).length || 0,
  });
}
