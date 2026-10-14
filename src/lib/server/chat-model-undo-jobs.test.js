import { test, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatModelJobs } from '../../../scripts/chat-model-jobs.mjs';
import { createChatModelPatches } from '../../../scripts/chat-model-patches.mjs';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'undo-jobs-')),
    owner = '33333333-3333-4333-8333-333333333333',
    home = modelPatchHome();
  home.ownerUserId = owner;
  let role = 'maintainer',
    prepares = 0;
  /** @type {()=>void} */ let release = () => {},
    entered = () => {};
  let wait = Promise.resolve(),
    began = Promise.resolve();
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
  const reviews = await createChatModelPatches({
      directory: join(directory, 'reviews'),
      authorize,
      verifySources: async () => {
        entered();
        await wait;
        return [{ id: 'manual', sha256: 'a'.repeat(64) }];
      }
    }),
    request = { homeId: 'example', token: 'synthetic-caller' },
    conversationId = '11111111-1111-4111-8111-111111111111';
  const prior = await reviews.prepare(
      modelPatchDraft(),
      { conversationId, turnId: '22222222-2222-4222-8222-222222222222' },
      request
    ),
    input = { conversationId, actionId: prior.actionId, digest: prior.digest };
  await reviews.approve(input, request);
  home.reconstruction.buildingModel.walls[0].openings[0].widthFeet = 3.5;
  home.revision++;
  const publisher = {
    status: async () => ({ status: 'model-applied', revision: 2 }),
    prepareRollback: async (
      /** @type {any} */ i,
      /** @type {any} */ r,
      /** @type {any} */ baseline
    ) => {
      prepares++;
      const draft = modelPatchDraft();
      draft.edits[0].expected = 3.5;
      draft.edits[0].value = 3;
      return reviews.prepare(
        draft,
        { conversationId, turnId: '44444444-4444-4444-8444-444444444444' },
        r,
        baseline
      );
    }
  };
  const options = {
      directory: join(directory, 'jobs'),
      authorize,
      reviewsFor: () => reviews,
      publisherFor: () => publisher
    },
    jobs = await createChatModelJobs(options);
  return {
    directory,
    options,
    jobs,
    reviews,
    input,
    request,
    home,
    prepares: () => prepares,
    setRole: (/** @type {string} */ r) => (role = r),
    pause: () => {
      began = new Promise((r) => (entered = () => r(undefined)));
      wait = new Promise((r) => (release = () => r(undefined)));
      return release;
    },
    began: () => began
  };
}
test('Undo request responds before inverse source audit and restart reuses one unapproved inverse review', async () => {
  const f = await fixture(),
    release = f.pause(),
    ack = await f.jobs.requestUndo(f.input, f.request);
  expect(ack.status).toBe('preparing-model-undo');
  expect(f.prepares()).toBe(0);
  const running = f.jobs.runUndo(f.input, f.request);
  await f.began();
  expect((await f.jobs.undoStatus(f.input, f.request)).status).toBe('preparing-model-undo');
  release();
  const result = await running;
  expect(result.status).toBe('undo-preview-ready');
  expect(result.review.actionId).not.toBe(f.input.actionId);
  expect(result.review.approvalRecorded).not.toBe(true);
  expect(result.review.changes[0].after).toBe(3);
  const recovered = await createChatModelJobs(f.options);
  expect((await recovered.requestUndo(f.input, f.request)).requestedAt).toBe(ack.requestedAt);
  expect((await recovered.runUndo(f.input, f.request)).review.digest).toBe(result.review.digest);
  expect(f.prepares()).toBe(1);
  const raw = await readFile(
    join(
      f.options.directory,
      'example',
      '33333333-3333-4333-8333-333333333333',
      f.input.conversationId,
      f.input.actionId + '.undo.json'
    ),
    'utf8'
  );
  expect(raw).not.toContain('synthetic-caller');
  expect(raw).not.toContain('buildingModel');
});
test('Undo cannot resume against a different queued home baseline or a revoked owner', async () => {
  const f = await fixture();
  await f.jobs.requestUndo(f.input, f.request);
  f.home.revision++;
  expect((await f.jobs.runUndo(f.input, f.request)).status).toBe('held-for-review');
  expect(f.prepares()).toBe(0);
  const g = await fixture();
  g.setRole('contributor');
  await expect(g.jobs.requestUndo(g.input, g.request)).rejects.toThrow();
});
test('damaged Undo result cannot be mistaken for missing work or regenerated', async () => {
  const f = await fixture();
  await f.jobs.requestUndo(f.input, f.request);
  await f.jobs.runUndo(f.input, f.request);
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.input.conversationId,
    f.input.actionId + '.undo.json.result'
  );
  await writeFile(path, 'null');
  await expect(f.jobs.undoStatus(f.input, f.request)).rejects.toThrow();
  await expect(f.jobs.runUndo(f.input, f.request)).rejects.toThrow();
  expect(f.prepares()).toBe(1);
});
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
test('worker queues Undo separately from Apply and returns the unapproved inverse after source verification', async () => {
  const f = await fixture(),
    worker = await createChatWorker({
      directory: join(f.directory, 'runs'),
      authorize: f.options.authorize,
      modelJobs: f.jobs,
      modelReviews: f.reviews,
      model: {
        async *stream() {
          yield { type: 'text', text: 'Review' };
        }
      }
    });
  await worker.dispatch({
    ...f.request,
    action: 'turn',
    input: {
      conversationId: f.input.conversationId,
      turnId: '22222222-2222-4222-8222-222222222222',
      message: 'Review',
      attachmentIds: []
    }
  });
  await worker.idle();
  const release = f.pause();
  try {
    const ack = await worker.dispatch({ ...f.request, action: 'undo-model', input: f.input });
    expect(ack.status).toBe('preparing-model-undo');
    expect(ack.operation.active).toBe(true);
    await f.began();
    const again = await worker.dispatch({ ...f.request, action: 'undo-model', input: f.input });
    expect(again.requestedAt).toBe(ack.requestedAt);
    release();
    await worker.idle();
    const status = await worker.dispatch({ ...f.request, action: 'undo-status', input: f.input });
    expect(status.status).toBe('undo-preview-ready');
    expect(status.review.approvalRecorded).not.toBe(true);
    expect(f.prepares()).toBe(1);
  } finally {
    release();
  }
});
test('durable server requests are discoverable after a lost acknowledgement without local browser refs', async () => {
  const f = await fixture();
  await f.jobs.requestUndo(f.input, f.request);
  const recovered = await createChatModelJobs(f.options);
  expect(await recovered.requests(f.input.conversationId, f.request)).toEqual([
    { ...f.input, kind: 'undo' }
  ]);
});
