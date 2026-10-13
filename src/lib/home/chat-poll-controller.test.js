import { test, expect } from 'vitest';
import { chatConversationReader } from './chat-poll-controller.js';
test('delayed old refresh cannot repopulate a newly selected conversation or advance its cursor', async () => {
  /** @type {any} */ let finish;
  const old = new Promise((resolve) => (finish = resolve));
  /** @type {string[]} */ const calls = [];
  const reader = chatConversationReader(async (/** @type {string} */ url) => {
    calls.push(url);
    return calls.length === 1
      ? old
      : {
          turns: [{ input: { message: 'New question' } }],
          events: [{ cursor: 1 }],
          storage: { state: 'confirmed' }
        };
  });
  reader.select('old');
  const pending = reader.poll(7);
  reader.select('new');
  finish({ turns: [{ input: { message: 'Old question' } }], events: [{ cursor: 8 }] });
  expect(await pending).toBe(null);
  expect(await reader.poll(0)).toMatchObject({
    turns: [{ input: { message: 'New question' } }],
    events: [{ cursor: 1 }]
  });
  expect(calls[1]).toContain('conversationId=new&cursor=0');
});
