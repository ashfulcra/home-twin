import { test, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatModelJobs } from '../../../scripts/chat-model-jobs.mjs';
import { createChatModelPatches } from '../../../scripts/chat-model-patches.mjs';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'model-jobs-')),
    owner = '33333333-3333-4333-8333-333333333333';
  const home = modelPatchHome();
  home.ownerUserId = owner;
  let role = 'maintainer',
    root = '/Example/twin',
    wait = Promise.resolve(),
    hashes = 0,
    published = 0,
    applied = new Set();
  /** @type {()=>void} */ let announce = () => {};
  let entered = Promise.resolve();
  const authorize = async () => ({
    scope: { homeId: 'example', principalId: owner, ownerUserId: owner, root, role },
    home,
    fileVersion: 'v' + home.revision
  });
  const reviews = await createChatModelPatches({
    directory: join(directory, 'reviews'),
    authorize,
    verifySources: async () => {
      hashes++;
      announce();
      await wait;
      return [{ id: 'manual', sha256: 'a'.repeat(64) }];
    }
  });
  const request = { token: 'synthetic-caller', homeId: 'example' },
    context = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      turnId: '22222222-2222-4222-8222-222222222222'
    };
  const proposal = await reviews.prepare(modelPatchDraft(), context, request),
    input = {
      conversationId: context.conversationId,
      actionId: proposal.actionId,
      digest: proposal.digest
    };
  // Only the native-effect boundary is replaced; real review/approval and private journals are exercised.
  const publisher = {
    publish: async (/** @type {any} */ i, /** @type {any} */ r) => {
      await reviews.readApproved(i, r);
      if (!applied.has(i.actionId)) {
        published++;
        applied.add(i.actionId);
      }
      return { status: 'model-applied', revision: 2 };
    },
    status: async (/** @type {any} */ i, /** @type {any} */ r) => {
      await reviews.readApproved(i, r);
      return {
        status: applied.has(i.actionId) ? 'model-applied' : 'model-approval-recorded',
        ...(applied.has(i.actionId) ? { revision: 2 } : {})
      };
    }
  };
  const options = {
    directory: join(directory, 'jobs'),
    authorize,
    reviewsFor: () => reviews,
    publisherFor: () => publisher
  };
  return {
    directory,
    options,
    reviews,
    request,
    input,
    home,
    jobs: await createChatModelJobs(options),
    hashes: () => hashes,
    auditStarted: () => entered,
    published: () => published,
    setRole: (/** @type {string} */ r) => (role = r),
    setRoot: (/** @type {string} */ r) => (root = r),
    pause: () => {
      /** @type {()=>void} */ let release = () => {};
      entered = new Promise((r) => (announce = () => r(undefined)));
      wait = new Promise((r) => (release = () => r(undefined)));
      return () => release();
    }
  };
}
test('exact human Apply request is durable before slow original verification and contains no credentials', async () => {
  const f = await fixture(),
    release = f.pause(),
    hashes = f.hashes();
  const ack = await f.jobs.request(f.input, f.request);
  expect(ack.status).toBe('checking-model-sources');
  expect(ack.approvalRecorded).toBe(false);
  expect(f.hashes()).toBe(hashes);
  const retry = await (await createChatModelJobs(f.options)).request(f.input, f.request);
  expect(retry.requestedAt).toBe(ack.requestedAt);
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.input.conversationId,
    f.input.actionId + '.json'
  );
  const raw = await readFile(path, 'utf8');
  expect(raw).not.toContain('synthetic-caller');
  expect(raw).not.toContain('buildingModel');
  const running = f.jobs.run(f.input, f.request);
  await f.auditStarted();
  expect((await f.jobs.status(f.input, f.request)).status).toBe('checking-model-sources');
  expect(f.published()).toBe(0);
  release();
  expect((await running).status).toBe('model-applied');
  expect(f.published()).toBe(1);
  const recovered = await createChatModelJobs(f.options),
    lastHashes = f.hashes();
  expect((await recovered.status(f.input, f.request)).status).toBe('model-applied');
  expect(f.hashes()).toBe(lastHashes);
  await recovered.run(f.input, f.request);
  expect(f.published()).toBe(1);
  expect(await readFile(path, 'utf8')).toBe(raw);
});
test('no saved human request means no approval or native effect; current owner required', async () => {
  const f = await fixture();
  await expect(f.jobs.run(f.input, f.request)).rejects.toThrow();
  expect(f.published()).toBe(0);
  f.setRole('contributor');
  await expect(f.jobs.request(f.input, f.request)).rejects.toThrow();
  expect(await readdir(f.options.directory)).toEqual([]);
});
test('changed digest, stale baseline and changed binding never admit a different request', async () => {
  const f = await fixture();
  await f.jobs.request(f.input, f.request);
  await expect(f.jobs.request({ ...f.input, digest: 'b'.repeat(64) }, f.request)).rejects.toThrow();
  f.setRoot('/Elsewhere/twin');
  await expect(f.jobs.status(f.input, f.request)).rejects.toThrow();
  expect(f.published()).toBe(0);
  const g = await fixture();
  g.home.revision++;
  await expect(g.jobs.request(g.input, g.request)).rejects.toThrow();
  expect(await readdir(g.options.directory)).toEqual([]);
});
test('revocation during queued original checks holds the request without model approval or publication', async () => {
  const f = await fixture();
  await f.jobs.request(f.input, f.request);
  const release = f.pause(),
    running = f.jobs.run(f.input, f.request);
  await f.auditStarted();
  f.setRole('contributor');
  release();
  expect((await running).status).toBe('held-for-review');
  expect(f.published()).toBe(0);
  f.setRole('maintainer');
  expect((await f.jobs.status(f.input, f.request)).status).toBe('held-for-review');
  expect((await f.reviews.list(f.input.conversationId, f.request))[0].approvalRecorded).not.toBe(
    true
  );
});
test('corrupt durable request holds instead of inventing a replacement consent', async () => {
  const f = await fixture();
  await f.jobs.request(f.input, f.request);
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.input.conversationId,
    f.input.actionId + '.json'
  );
  const j = JSON.parse(await readFile(path, 'utf8'));
  j.intent.input.digest = 'b'.repeat(64);
  await writeFile(path, JSON.stringify(j));
  await expect(f.jobs.run(f.input, f.request)).rejects.toThrow();
  await expect(f.jobs.request(f.input, f.request)).rejects.toThrow();
  expect(f.published()).toBe(0);
});
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
test('worker acknowledges durable model request before slow audit, coalesces duplicate jobs and polls without rehash', async () => {
  const f = await fixture(),
    options = {
      directory: join(f.directory, 'runs'),
      authorize: f.options.authorize,
      modelJobs: f.jobs,
      modelReviews: f.reviews,
      model: {
        async *stream() {
          yield { type: 'text', text: 'Synthetic review ready' };
        }
      }
    };
  const worker = await createChatWorker(options);
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
  let ack;
  try {
    ack = await worker.dispatch({ ...f.request, action: 'apply-model', input: f.input });
  } catch (e) {
    release();
    throw e;
  }
  expect(ack.status).toBe('checking-model-sources');
  expect(ack.operation.active).toBe(true);
  const again = await worker.dispatch({ ...f.request, action: 'apply-model', input: f.input });
  expect(again.operation.active).toBe(true);
  await f.auditStarted();
  const count = f.hashes();
  expect(
    (await worker.dispatch({ ...f.request, action: 'model-status', input: f.input })).status
  ).toBe('checking-model-sources');
  expect(f.hashes()).toBe(count);
  await expect(
    worker.dispatch({
      ...f.request,
      action: 'apply-model',
      input: { ...f.input, digest: 'b'.repeat(64) }
    })
  ).rejects.toThrow();
  release();
  await worker.idle();
  expect(f.published()).toBe(1);
  expect(
    (await worker.dispatch({ ...f.request, action: 'model-status', input: f.input })).status
  ).toBe('model-applied');
  const recovered = await createChatWorker({
    ...options,
    modelJobs: await createChatModelJobs(f.options)
  });
  expect(
    (await recovered.dispatch({ ...f.request, action: 'apply-model', input: f.input })).status
  ).toBe('model-applied');
  await recovered.idle();
  expect(f.published()).toBe(1);
  f.setRole('contributor');
  await expect(
    worker.dispatch({ ...f.request, action: 'apply-model', input: f.input })
  ).rejects.toThrow();
  await expect(
    worker.dispatch({ ...f.request, action: 'model-status', input: f.input })
  ).rejects.toThrow();
});
import { createModelActionJobs } from '../../../scripts/home-chat-service.mjs';
test('native factory requires explicit model action opt-in and existing private designated maintainer state', async () => {
  const f = await fixture(),
    config = {
      directory: f.directory,
      homes: [
        {
          homeId: 'example',
          modelReviews: true,
          modelActions: false,
          recordActions: true,
          maintainerDirectory: join(f.directory, 'missing-state')
        }
      ]
    };
  expect(await createModelActionJobs(config, f.options.authorize, async () => [], f.reviews)).toBe(
    null
  );
  config.homes[0].modelActions = true;
  await expect(
    createModelActionJobs(config, f.options.authorize, async () => [], f.reviews)
  ).rejects.toThrow();
  config.homes[0].maintainerDirectory = f.directory;
  const jobs = await createModelActionJobs(config, f.options.authorize, async () => [], f.reviews);
  if (!jobs) throw Error('Expected explicit model opt-in');
  expect((await jobs.request(f.input, f.request)).status).toBe('checking-model-sources');
  expect(f.published()).toBe(0);
});
import { rename } from 'node:fs/promises';
test('interrupted held outcome remains held and never starts a replacement approval', async () => {
  const f = await fixture();
  await f.jobs.request(f.input, f.request);
  f.home.revision++;
  expect((await f.jobs.run(f.input, f.request)).status).toBe('held-for-review');
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.input.conversationId,
    f.input.actionId + '.json.held'
  );
  await rename(path, path + '.tmp');
  const recovered = await createChatModelJobs(f.options);
  expect((await recovered.status(f.input, f.request)).status).toBe('held-for-review');
  expect((await recovered.request(f.input, f.request)).status).toBe('held-for-review');
  expect(f.published()).toBe(0);
});
test('different requests for one home wait behind source audit instead of losing queued progress', async () => {
  const f = await fixture(),
    proposal = await f.reviews.prepare(
      { ...modelPatchDraft(), note: 'Second synthetic change' },
      { conversationId: f.input.conversationId, turnId: '44444444-4444-4444-8444-444444444444' },
      f.request
    ),
    second = {
      conversationId: f.input.conversationId,
      actionId: proposal.actionId,
      digest: proposal.digest
    };
  const worker = await createChatWorker({
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
  await worker.dispatch({ ...f.request, action: 'apply-model', input: f.input });
  await worker.dispatch({ ...f.request, action: 'apply-model', input: second });
  release();
  await worker.idle();
  expect(f.published()).toBe(2);
  expect(
    (await worker.dispatch({ ...f.request, action: 'model-status', input: second })).status
  ).toBe('model-applied');
});
test('factory opt-in never advertises model actions in another owner home', async () => {
  const f = await fixture(),
    jobs = await createModelActionJobs(
      {
        directory: f.directory,
        homes: [
          {
            homeId: 'example',
            modelActions: true,
            modelReviews: true,
            recordActions: true,
            maintainerDirectory: f.directory
          },
          { homeId: 'second' }
        ]
      },
      f.options.authorize,
      async () => [],
      f.reviews
    );
  const worker = await createChatWorker({
    directory: join(f.directory, 'runs'),
    modelJobs: jobs,
    authorize: async () => {
      const a = await f.options.authorize();
      return { ...a, scope: { ...a.scope, homeId: 'second' } };
    }
  });
  expect(
    (await worker.dispatch({ token: f.request.token, homeId: 'second', action: 'status' }))
      .modelActions
  ).not.toBe(true);
});
test('a corrupt present held receipt never becomes missing consent or permits retry', async () => {
  const f = await fixture();
  await f.jobs.request(f.input, f.request);
  f.home.revision++;
  expect((await f.jobs.run(f.input, f.request)).status).toBe('held-for-review');
  f.home.revision--;
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.input.conversationId,
    f.input.actionId + '.json.held'
  );
  for (const body of ['null', 'false', '0', '""', '[]']) {
    await writeFile(path, body);
    await expect(f.jobs.run(f.input, f.request)).rejects.toThrow();
    expect(f.published()).toBe(0);
  }
});
test('held publication status still reports the actual separately audited owner approval', async () => {
  const f = await fixture();
  const publisher = {
    publish: async () => ({ status: 'held-for-review' }),
    status: async () => ({ status: 'held-for-review' })
  };
  const jobs = await createChatModelJobs({ ...f.options, publisherFor: () => publisher });
  await jobs.request(f.input, f.request);
  await jobs.run(f.input, f.request);
  expect((await f.reviews.list(f.input.conversationId, f.request))[0].approvalRecorded).toBe(true);
  expect((await jobs.status(f.input, f.request)).approvalRecorded).toBe(true);
  expect((await jobs.run(f.input, f.request)).approvalRecorded).toBe(true);
});
