import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatActions } from '../../../scripts/chat-actions.mjs';
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
test('approval responds before slow publication, coalesces retries and polls actual saved progress', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'record-jobs-')),
    owner = '33333333-3333-4333-8333-333333333333',
    conversationId = '11111111-1111-4111-8111-111111111111';
  const scope = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role: 'maintainer'
  };
  const home = {
    id: 'example',
    ownerUserId: owner,
    revision: 1,
    equipment: [],
    rooms: [],
    sources: []
  };
  const authorize = async () => ({ scope, home, fileVersion: 'v1' });
  /** @type {()=>void} */ let release = () => {};
  let rounds = 0,
    writes = 0,
    publishes = 0;
  const gate = new Promise((r) => (release = () => r(undefined))),
    files = new Map();
  const actions = await createChatActions({
    directory: join(dir, 'actions'),
    authorize,
    verifySources: async () => [],
    ioFor: () => ({
      read: async (/** @type {string} */ p) => files.get(p) ?? null,
      write: async (
        /** @type {string} */ p,
        /** @type {Uint8Array} */ b,
        /** @type {string} */ m,
        /** @type {()=>Promise<void>} */ before
      ) => {
        await before();
        files.set(p, b);
        writes++;
      }
    }),
    publish: async () => {
      publishes++;
      await gate;
      return { status: 'accepted', revision: 2 };
    }
  });
  const worker = await createChatWorker({
    directory: join(dir, 'runs'),
    authorize,
    actions,
    model: {
      async *stream() {
        if (rounds++ === 0)
          yield {
            type: 'tool',
            name: 'prepare_note',
            arguments: JSON.stringify({ text: 'Synthetic slow save', entityId: '', sourceIds: [] }),
            callId: 'draft'
          };
        else yield { type: 'text', text: 'Review' };
      }
    }
  });
  const req = { token: 'synthetic-caller', homeId: 'example' };
  await worker.dispatch({
    ...req,
    action: 'turn',
    input: {
      conversationId,
      turnId: '22222222-2222-4222-8222-222222222222',
      message: 'Prepare note',
      attachmentIds: []
    }
  });
  await worker.idle();
  const before = await worker.dispatch({ ...req, action: 'events', conversationId, cursor: 0 });
  expect(writes).toBe(0);
  const a = before.actions[0],
    input = { conversationId, actionId: a.actionId, digest: a.digest };
  const pending = worker.dispatch({ ...req, action: 'apply-record', input });
  const ack = await Promise.race([
    pending,
    new Promise((r) => setTimeout(() => r({ status: 'timeout' }), 1000))
  ]);
  if (ack.status === 'timeout') {
    release();
    await pending;
    await worker.idle();
    expect(ack.status).not.toBe('timeout');
    return;
  }
  expect(ack.status).toBe('queued');
  expect(ack.operation.active).toBe(true);
  const retry = await worker.dispatch({ ...req, action: 'apply-record', input });
  expect(retry.operation.active).toBe(true);
  await expect(
    worker.dispatch({ ...req, action: 'apply-record', input: { ...input, digest: 'b'.repeat(64) } })
  ).rejects.toThrow();
  const during = await worker.dispatch({ ...req, action: 'events', conversationId, cursor: 0 });
  expect(during.actions[0].operation.active).toBe(true);
  release();
  await worker.idle();
  const after = await worker.dispatch({ ...req, action: 'events', conversationId, cursor: 0 });
  expect(after.actions[0].status).toBe('accepted');
  expect(writes).toBe(1);
  expect(publishes).toBe(1);
});
