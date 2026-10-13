import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatActions } from '../../../scripts/chat-actions.mjs';
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
test('the actual worker prepares a review with no writes and saves only an exact later caller approval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chat-worker-actions-')),
    owner = '33333333-3333-4333-8333-333333333333';
  let role = 'maintainer',
    writes = 0,
    rounds = 0;
  const files = new Map();
  const scope = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role
  };
  /** @type {any} */ let home = {
    schemaVersion: 1,
    id: 'example',
    ownerUserId: owner,
    revision: 1,
    equipment: [],
    rooms: [],
    sources: []
  };
  const authorize = async () => ({
    scope: { ...scope, role },
    home: structuredClone(home),
    fileVersion: 'v' + home.revision
  });
  const actions = await createChatActions({
    directory: join(directory, 'actions'),
    authorize,
    verifySources: async () => [],
    ioFor: () => ({
      read: async (/** @type {string} */ path) => files.get(path) ?? null,
      write: async (
        /** @type {string} */ path,
        /** @type {Uint8Array} */ bytes,
        /** @type {string} */ mime,
        /** @type {()=>Promise<void>} */ before
      ) => {
        await before();
        writes++;
        files.set(path, bytes);
      }
    }),
    publish: async (/** @type {any} */ record) => {
      home = { ...home, revision: 2, contributionEvidence: [record] };
      return { status: 'accepted', revision: 2 };
    }
  });
  const worker = await createChatWorker({
    directory: join(directory, 'runs'),
    authorize,
    actions,
    model: {
      async *stream() {
        if (rounds++ === 0)
          yield {
            type: 'tool',
            name: 'prepare_note',
            arguments: JSON.stringify({
              text: 'User supplied synthetic house note',
              entityId: '',
              sourceIds: []
            }),
            callId: 'draft'
          };
        else yield { type: 'text', text: 'Ready for review' };
      }
    }
  });
  const conversationId = '11111111-1111-4111-8111-111111111111',
    turnId = '22222222-2222-4222-8222-222222222222',
    request = { token: 'exact-current-caller', homeId: 'example' };
  await worker.dispatch({
    ...request,
    action: 'turn',
    input: {
      conversationId,
      turnId,
      message: 'Save a synthetic note after I review it',
      attachmentIds: []
    }
  });
  await worker.idle();
  const result = await worker.dispatch({ ...request, action: 'events', conversationId, cursor: 0 });
  expect(result.turns[0].status).toBe('completed');
  expect(result.actions).toHaveLength(1);
  expect(writes).toBe(0);
  const proposal = result.actions[0],
    input = { conversationId, actionId: proposal.actionId, digest: proposal.digest };
  await expect(
    worker.dispatch({
      ...request,
      action: 'apply-record',
      input: { ...input, digest: 'b'.repeat(64) }
    })
  ).rejects.toThrow();
  expect(writes).toBe(0);
  expect((await worker.dispatch({ ...request, action: 'apply-record', input })).status).toBe(
    'accepted'
  );
  expect(writes).toBe(1);
  expect((await worker.dispatch({ ...request, action: 'apply-record', input })).status).toBe(
    'accepted'
  );
  expect(writes).toBe(1);
  role = 'viewer';
  expect(
    (await worker.dispatch({ ...request, action: 'events', conversationId, cursor: 0 })).actions
  ).toEqual([]);
  await expect(worker.dispatch({ ...request, action: 'apply-record', input })).rejects.toThrow(
    /role|write|contribution/i
  );
  expect(writes).toBe(1);
});
