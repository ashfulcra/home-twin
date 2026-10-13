import { test, expect } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatModelPatches } from '../../../scripts/chat-model-patches.mjs';
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
import { createChatHomeTools } from '../../../scripts/chat-home-tools.mjs';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
test('model preparation is a separate exact tool with current-role checks and no record publisher', async () => {
  let role = 'maintainer',
    calls = 0;
  const tools = createChatHomeTools({
    authorize: async () => ({ home: modelPatchHome(), role }),
    prepareModelPatch: async (/** @type {any} */ draft) => {
      calls++;
      return draft;
    }
  });
  const { kind, ...args } = modelPatchDraft();
  expect(
    tools.definitions.find((/** @type {any} */ d) => d.name === 'prepare_model_patch')
  ).toBeDefined();
  expect(await tools.execute('prepare_model_patch', args)).toEqual(modelPatchDraft());
  await expect(
    tools.execute('prepare_model_patch', { ...args, root: '/Other/twin' })
  ).rejects.toThrow();
  role = 'viewer';
  await expect(tools.execute('prepare_model_patch', args)).rejects.toThrow(/role/);
  expect(calls).toBe(1);
});
test('actual worker emits a durable model review and provides exact readonly preview, preserving home and record actions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worker-model-')),
    owner = '33333333-3333-4333-8333-333333333333',
    home = modelPatchHome();
  home.ownerUserId = owner;
  let role = 'maintainer',
    rounds = 0;
  const authorize = async () => ({
    scope: {
      homeId: 'example',
      principalId: owner,
      ownerUserId: owner,
      root: '/Example/twin',
      role
    },
    home: structuredClone(home),
    fileVersion: 'v' + home.revision
  });
  await mkdir(join(directory, 'reviews'), { mode: 0o700 });
  const reviews = await createChatModelPatches({
    directory: join(directory, 'reviews'),
    authorize,
    verifySources: async () => [{ id: 'manual', sha256: 'a'.repeat(64) }]
  });
  const worker = await createChatWorker({
    directory: join(directory, 'runs'),
    authorize,
    modelReviews: reviews,
    model: {
      async *stream() {
        if (rounds++ === 0) {
          const { kind, ...args } = modelPatchDraft();
          yield {
            type: 'tool',
            name: 'prepare_model_patch',
            arguments: JSON.stringify(args),
            callId: 'review'
          };
        } else yield { type: 'text', text: 'Review this proposed correction.' };
      }
    }
  });
  const request = { token: 'current-caller', homeId: 'example' },
    conversationId = '11111111-1111-4111-8111-111111111111',
    turnId = '22222222-2222-4222-8222-222222222222',
    raw = JSON.stringify(home);
  expect((await worker.dispatch({ ...request, action: 'status' })).modelReviews).toBe(true);
  await worker.dispatch({
    ...request,
    action: 'turn',
    input: {
      conversationId,
      turnId,
      message: 'Prepare a synthetic width correction',
      attachmentIds: []
    }
  });
  await worker.idle();
  const event = await worker.dispatch({ ...request, action: 'events', conversationId, cursor: 0 });
  expect(event.turns[0].status).toBe('completed');
  expect(event.modelReviews).toHaveLength(1);
  const a = event.modelReviews[0],
    input = { conversationId, actionId: a.actionId, digest: a.digest };
  expect(
    (await worker.dispatch({ ...request, action: 'preview-model', input })).walls[0].after
      .openings[0].widthFeet
  ).toBe(3.5);
  expect(JSON.stringify(home)).toBe(raw);
  home.revision++;
  await expect(worker.dispatch({ ...request, action: 'preview-model', input })).rejects.toThrow(
    /changed/
  );
  home.revision--;
  role = 'viewer';
  expect(
    (await worker.dispatch({ ...request, action: 'events', conversationId, cursor: 0 }))
      .modelReviews
  ).toEqual([]);
  await expect(worker.dispatch({ ...request, action: 'preview-model', input })).rejects.toThrow(
    /role/
  );
  await expect(worker.dispatch({ ...request, action: 'apply-model', input })).rejects.toThrow(
    /Unsupported/
  );
});
