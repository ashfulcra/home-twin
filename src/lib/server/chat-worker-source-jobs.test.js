import { test, expect } from 'vitest';
import { mkdtemp, mkdir, access, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatWorker, createSourceActionJobs } from '../../../scripts/home-chat-service.mjs';
const owner = '33333333-3333-4333-8333-333333333333',
  actionId = '11111111-1111-4111-8111-111111111111',
  sourceId = 'evidence-' + actionId,
  digest = 'a'.repeat(64),
  input = { actionId, digest },
  req = { token: 'synthetic-caller', homeId: 'example' };
async function fixture(/** @type {any} */ jobs) {
  const directory = await mkdtemp(join(tmpdir(), 'source-worker-'));
  let role = 'maintainer',
    version = 'v1';
  const authorize = async () => ({
    scope: {
      homeId: 'example',
      principalId: owner,
      ownerUserId: owner,
      root: '/Example/twin',
      role
    },
    home: { id: 'example', ownerUserId: owner, revision: 1 },
    fileVersion: version
  });
  const worker = await createChatWorker({
    directory: join(directory, 'runs'),
    authorize,
    sourceJobs: jobs
  });
  return {
    worker,
    directory,
    authorize,
    role: (/** @type {string} */ r) => (role = r),
    version: (/** @type {string} */ v) => (version = v)
  };
}
const deferred = () => {
  /** @type {()=>void} */ let release = () => {};
  return { promise: new Promise((r) => (release = () => r(undefined))), release: () => release() };
};
test('source review responds before slow read-only hashing and coalesces the same source', async () => {
  const gate = deferred();
  let calls = 0;
  const f = await fixture({
    available: () => true,
    prepare: async () => {
      calls++;
      await gate.promise;
      return { ...input, sourceId, status: 'source-review-ready', requestSaved: false };
    }
  });
  const ack = await Promise.race([
    f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId } }),
    new Promise((r) => setTimeout(() => r({ status: 'timeout' }), 500))
  ]);
  expect(ack.status).toBe('checking-source');
  expect(ack.operation.active).toBe(true);
  expect(
    (await f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId } })).operation
      .active
  ).toBe(true);
  expect(calls).toBe(1);
  gate.release();
  await f.worker.idle();
  expect(
    (await f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId } })).status
  ).toBe('source-review-ready');
});
test('saved owner request is acknowledged before publication, duplicate retries coalesce, and status does not run work', async () => {
  const gate = deferred();
  let admissions = 0,
    runs = 0;
  /** @type {any} */ let state = {
    ...input,
    sourceId,
    status: 'checking-source',
    requestSaved: true
  };
  const f = await fixture({
    available: () => true,
    request: async (/** @type {any} */ i) => {
      expect(i).toEqual(input);
      admissions++;
      return state;
    },
    status: async (/** @type {any} */ i) => {
      expect(i).toEqual(input);
      return state;
    },
    run: async () => {
      runs++;
      await gate.promise;
      state = { ...state, status: 'accepted', revision: 2 };
      return state;
    }
  });
  const ack = await f.worker.dispatch({ ...req, action: 'save-source', input });
  expect(ack.requestSaved).toBe(true);
  expect(ack.operation.active).toBe(true);
  expect((await f.worker.dispatch({ ...req, action: 'save-source', input })).operation.active).toBe(
    true
  );
  expect(admissions).toBe(1);
  expect((await f.worker.dispatch({ ...req, action: 'source-status', input })).status).toBe(
    'checking-source'
  );
  expect(runs).toBe(1);
  gate.release();
  await f.worker.idle();
  const done = await f.worker.dispatch({ ...req, action: 'source-status', input });
  expect(done.status).toBe('accepted');
  expect(done.operation.active).toBe(false);
  expect(runs).toBe(1);
});
test('source jobs stay owner-only, disabled homes stay unavailable and client authority fields are rejected', async () => {
  let calls = 0;
  const f = await fixture({
    available: (/** @type {string} */ h) => h === 'example',
    prepare: async () => {
      calls++;
      return {};
    },
    request: async () => {
      calls++;
      return {};
    },
    status: async () => {
      calls++;
      return {};
    }
  });
  expect((await f.worker.dispatch({ ...req, action: 'status' })).sourceActions).toBe(true);
  for (const role of ['viewer', 'contributor']) {
    f.role(role);
    expect((await f.worker.dispatch({ ...req, action: 'status' })).sourceActions).toBe(false);
    for (const action of ['source-review', 'save-source', 'source-status'])
      await expect(
        f.worker.dispatch({
          ...req,
          action,
          input: action === 'source-review' ? { sourceId } : input
        })
      ).rejects.toThrow();
  }
  f.role('maintainer');
  for (const action of ['source-review', 'save-source', 'source-status'])
    await expect(
      f.worker.dispatch({
        ...req,
        action,
        input: { ...(action === 'source-review' ? { sourceId } : input), root: '/Foreign/twin' }
      })
    ).rejects.toThrow();
  expect(calls).toBe(0);
  const absent = await fixture(undefined);
  await expect(absent.worker.dispatch({ ...req, action: 'save-source', input })).rejects.toThrow();
});
test('explicit source opt-in validates the existing maintainer directory and never creates a replacement', async () => {
  const f = await fixture(undefined),
    state = join(f.directory, 'existing-maintainer');
  expect(
    await createSourceActionJobs(
      { directory: f.directory, homes: [{ homeId: 'example', recordActions: true }] },
      f.authorize,
      () => [],
      {}
    )
  ).toBeNull();
  const home = {
    homeId: 'example',
    sourceActions: true,
    recordActions: true,
    maintainerDirectory: state
  };
  await expect(
    createSourceActionJobs({ directory: f.directory, homes: [home] }, f.authorize, () => [], {})
  ).rejects.toThrow();
  await expect(access(state)).rejects.toThrow();
  await mkdir(state, { mode: 0o700 });
  const jobs = await createSourceActionJobs(
    { directory: f.directory, homes: [home] },
    f.authorize,
    () => [],
    { source: async () => null }
  );
  if (!jobs) throw Error('Source jobs missing');
  expect(jobs.available('example')).toBe(true);
  expect(jobs.available('other')).toBe(false);
});

test('a changed baseline cannot orphan an active preparation or bypass the worker bound', async () => {
  const gate = deferred();
  let calls = 0;
  const f = await fixture({
    available: () => true,
    prepare: async () => {
      calls++;
      await gate.promise;
      return { ...input, sourceId, status: 'source-review-ready' };
    }
  });
  await f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId } });
  for (let n = 2; n <= 10; n++) {
    f.version('v' + n);
    await f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId } });
  }
  gate.release();
  await f.worker.idle();
  expect(calls).toBe(1);
});
test('completed unread preparations cannot block a ninth source while active work stays bounded', async () => {
  const f = await fixture({
    available: () => true,
    prepare: async (/** @type {any} */ i) => ({
      ...input,
      sourceId: i.sourceId,
      status: 'source-review-ready'
    })
  });
  for (let n = 1; n <= 9; n++) {
    const id = 'evidence-' + String(n).padStart(8, '0') + '-1111-4111-8111-111111111111';
    expect(
      (await f.worker.dispatch({ ...req, action: 'source-review', input: { sourceId: id } }))
        .operation.active
    ).toBe(true);
    await f.worker.idle();
  }
});

test('source selection becomes unavailable when its pinned maintainer state is missing or replaced', async () => {
  const f = await fixture(undefined),
    state = join(f.directory, 'maintainer');
  await mkdir(state, { mode: 0o700 });
  const jobs = await createSourceActionJobs(
    {
      directory: f.directory,
      homes: [
        { homeId: 'example', sourceActions: true, recordActions: true, maintainerDirectory: state }
      ]
    },
    f.authorize,
    () => [],
    { source: async () => null }
  );
  if (!jobs) throw Error('Missing jobs');
  expect(jobs.available('example')).toBe(true);
  await rename(state, state + '-preserved');
  expect(jobs.available('example')).toBe(false);
  await mkdir(state, { mode: 0o700 });
  expect(jobs.available('example')).toBe(false);
});
