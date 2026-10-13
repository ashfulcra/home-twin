import { test, expect } from 'vitest';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistentChatJournal } from '../../../scripts/chat-journal.mjs';
const scope = {
  homeId: 'example',
  principalId: '33333333-3333-4333-8333-333333333333',
  ownerUserId: '33333333-3333-4333-8333-333333333333',
  root: '/Example/twin',
  role: 'maintainer'
};
const input = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  turnId: '22222222-2222-4222-8222-222222222222',
  message: 'Describe the house',
  attachmentIds: []
};
const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'home-chat-'));
  return { dir, j: await persistentChatJournal(dir, scope) };
};
test('stable turn replay preserves events and rejects changed intent', async () => {
  const { j } = await setup();
  expect((await j.createTurn(input)).created).toBe(true);
  await j.appendEvent(input, 'text', { text: 'Hello' });
  expect((await j.createTurn(input)).created).toBe(false);
  expect(
    (await j.readEvents(input.conversationId, 0)).map((/** @type {any} */ x) => x.type)
  ).toEqual(['queued', 'text']);
  expect(await j.readEvents(input.conversationId, 1)).toHaveLength(1);
  await expect(j.createTurn({ ...input, message: 'Changed' })).rejects.toThrow(/intent/i);
});
test('journal identity isolates home and actor; credentials never enter events', async () => {
  const { dir, j } = await setup();
  await j.createTurn(input);
  await expect(persistentChatJournal(dir, { ...scope, homeId: 'other' })).rejects.toThrow(/scope/i);
  await expect(
    persistentChatJournal(dir, {
      ...scope,
      principalId: '44444444-4444-4444-8444-444444444444',
      role: 'viewer'
    })
  ).rejects.toThrow(/scope/i);
  await expect(j.appendEvent(input, 'text', { text: 'safe', token: 'secret' })).rejects.toThrow(
    /event/i
  );
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(join(dir, input.conversationId + '.json'))).mode & 0o777).toBe(0o600);
  expect(await readFile(join(dir, input.conversationId + '.json'), 'utf8')).not.toContain('secret');
});
test('only one running turn per conversation and explicit cancellation is terminal', async () => {
  const { j } = await setup();
  await j.createTurn(input);
  await expect(
    j.createTurn({ ...input, turnId: '55555555-5555-4555-8555-555555555555' })
  ).rejects.toThrow(/active/i);
  await j.cancel(input);
  expect((await j.readEvents(input.conversationId, 0)).at(-1).type).toBe('cancelled');
  await expect(j.appendEvent(input, 'text', { text: 'late' })).rejects.toThrow(/terminal/i);
});
test('restart recovery marks unfinished work interrupted and never replays provider/effects', async () => {
  const { dir, j } = await setup();
  await j.createTurn(input);
  await j.appendEvent(input, 'started', {});
  const reopened = await persistentChatJournal(dir, scope);
  expect(await reopened.recover()).toEqual([input.turnId]);
  expect((await reopened.readEvents(input.conversationId, 0)).at(-1).type).toBe('interrupted');
  expect((await reopened.createTurn(input)).created).toBe(false);
});
test('concurrent event writes serialize without lost cursor events', async () => {
  const { j } = await setup();
  await j.createTurn(input);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => j.appendEvent(input, 'text', { text: String(i) }))
  );
  expect(
    (await j.readEvents(input.conversationId, 0)).map((/** @type {any} */ e) => e.cursor)
  ).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
});
test('event exhaustion retains capacity for terminal completion and recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chat-limit-'));
  const journal = await persistentChatJournal(dir, scope);
  await journal.createTurn(input);
  await journal.appendEvent(input, 'started', {});
  const path = join(dir, input.conversationId + '.json');
  const record = JSON.parse(await readFile(path, 'utf8'));
  for (let i = record.events.length; i < 4999; i++)
    record.events.push({
      cursor: i + 1,
      turnId: input.turnId,
      type: 'text',
      data: { text: 'x' },
      at: '2026-10-13T00:00:00Z'
    });
  await writeFile(path, JSON.stringify(record));
  await expect(journal.appendEvent(input, 'text', { text: 'overflow' })).rejects.toThrow(/limit/i);
  await journal.appendEvent(input, 'completed', {});
  expect((await journal.readConversation(input.conversationId)).turns[0].status).toBe('completed');
  expect((await journal.readEvents(input.conversationId)).length).toBe(5000);
});
