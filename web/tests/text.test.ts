import { required } from './support/fixtures';
import { test, expect } from 'vitest';
import { WhatsApp as adapter } from '../src/whatsapp';

test('UTF-8 bounds preserve complete emoji and accents', () => {
  expect(adapter.utf8Limit('😊😊é', 6)).toBe('😊');
  expect(adapter.utf8Limit('ééé', 5)).toBe('éé');
  expect(adapter.byteLength('😊é')).toBe(6);
});
test('chat identity follows WhatsApp message IDs, including groups and LIDs', () => {
  expect(adapter.conversationFromMessageId('false_51999999999@c.us_ABC')).toBe('51999999999@c.us');
  expect(adapter.conversationFromMessageId('true_12345@lid_ABC')).toBe('12345@lid');
  expect(adapter.conversationFromMessageId('false_123-456@g.us_ABC_sender@c.us')).toBe(
    '123-456@g.us',
  );
  expect(adapter.conversationFromMessageId('Lucía')).toBe(null);
  expect(adapter.conversationFromMessageId('false_not-a-chat_ABC')).toBe(null);
  expect(adapter.messageId('3EB0A123456789ABCDEF0123456789AB')).toBe(true);
  expect(adapter.conversationFromMessageId('3EB0A123456789ABCDEF0123456789AB')).toBe(null);
  expect(adapter.messageId('unknown-format')).toBe(false);
});
test('context excludes target and future messages and is bounded', () => {
  const messages = Array.from({ length: 15 }, (_, i) => ({
    id: `${i}`,
    text: `${i}`,
    direction: 'incoming' as const,
  }));
  const context = adapter.context(messages, '10');
  expect(context.length).toBe(8);
  expect(required(context.at(0)).text).toBe('2');
  expect(required(context.at(-1)).text).toBe('9');
  expect(adapter.context(messages, 'unknown').length).toBe(0);
});
