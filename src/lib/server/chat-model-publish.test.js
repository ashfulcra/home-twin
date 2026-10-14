import { createChatModelPublisher } from '../../../scripts/chat-model-publish.mjs';
import { test, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
import { createChatModelPatches } from '../../../scripts/chat-model-patches.mjs';
const owner = '33333333-3333-4333-8333-333333333333';
async function fixture(approved = true) {
  const parent = await mkdtemp(join(tmpdir(), 'native-model-')),
    directory = join(parent, 'maintainer');
  await mkdir(directory, { mode: 0o700 });
  let home = modelPatchHome(),
    role = 'maintainer',
    version = 'v7',
    original = 'a'.repeat(64);
  home.ownerUserId = owner;
  home.sources = [{ id: 'manual', sha256: original, path: '/Example/twin/sources/manual.txt' }];
  const scope = () => ({
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role
  });
  const authorize = async () => ({
    scope: scope(),
    home: structuredClone(home),
    fileVersion: version
  });
  const verifySources = async () => [{ id: 'manual', sha256: original }];
  const patch = await createChatModelPatches({
    directory: join(parent, 'reviews'),
    authorize,
    verifySources
  });
  const request = { token: 'synthetic-caller-token', homeId: 'example' },
    context = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      turnId: '22222222-2222-4222-8222-222222222222'
    };
  const a = await patch.prepare(modelPatchDraft(), context, request),
    input = { actionId: a.actionId, conversationId: a.conversationId, digest: a.digest };
  if (approved) await patch.approve(input, request);
  await writeFile(
    join(directory, 'checkpoint.json'),
    JSON.stringify({
      schema: 'home-twin-checkpoint/1',
      homeId: 'example',
      principalId: owner,
      root: '/Example/twin'
    }),
    { mode: 0o600 }
  );
  const files = new Map();
  /** @type {string[]} */ const writes = [];
  let mode = '',
    drift = false,
    inHomeGuard = false,
    homeReads = 0;
  const native = () => ({
    home: structuredClone(home),
    principalId: owner,
    root: '/Example/twin',
    baselineVersion: version,
    rows: [],
    unavailableMembers: [],
    sourceChecks: [
      {
        id: 'manual',
        status: original === 'a'.repeat(64) ? 'unchanged' : 'changed',
        currentSHA256: original
      }
    ]
  });
  const client = {
    read: async () => {
      const snapshot = native();
      if (inHomeGuard && ++homeReads === 2 && mode === 'revoke-final-native-read')
        role = 'contributor';
      return snapshot;
    },
    readSnapshot: async (/** @type {string} */ path) => files.get(path) ?? null,
    write: async (
      /** @type {string} */ path,
      /** @type {any} */ value,
      /** @type {(()=>Promise<void>)|undefined} */ guard = undefined
    ) => {
      if (path.endsWith('/home.json') && drift) {
        home.contacts.push({ id: 'later', name: 'Later' });
        version = 'v-later';
      }
      if (path.endsWith('/home.json')) inHomeGuard = true;
      if (guard) await guard();
      if (mode === 'reject-write') throw Error('transport failed before upload');
      writes.push(path);
      files.set(path, structuredClone(value));
      if (path.endsWith('/home.json')) {
        home = structuredClone(value);
        version = 'v8';
        if (mode === 'lost-success') throw Error('response lost after committed upload');
      }
    }
  };
  const publisher = createChatModelPublisher({
    directory,
    authorize,
    verifySources,
    readApproved: (/** @type {any} */ i, /** @type {any} */ r) => patch.readApproved(i, r),
    prepareModelPatch: (
      /** @type {any} */ d,
      /** @type {any} */ c,
      /** @type {any} */ r,
      /** @type {any} */ b
    ) => {
      if (mode === 'revoke-before-undo-prepare') role = 'contributor';
      if (mode === 'drift-before-undo-prepare') {
        home.reconstruction.buildingModel.walls[0].thicknessFeet = 0.6;
        version = 'drifted';
      }
      return patch.prepare(d, c, r, b);
    },
    clientFor: (/** @type {string} */ id, /** @type {any} */ opts, /** @type {string} */ token) => {
      if (
        id !== 'example' ||
        opts.root !== '/Example/twin' ||
        !opts.checkSources ||
        token !== request.token
      )
        throw Error('wrong current-token client');
      return client;
    }
  });
  return {
    directory,
    patch,
    publisher,
    request,
    input,
    writes,
    files,
    home: () => home,
    setRole: (/** @type {any} */ r) => (role = r),
    setOriginal: (/** @type {any} */ s) => (original = s),
    setMode: (/** @type {any} */ m) => (mode = m),
    setDrift: () => (drift = true),
    setHome: (/** @type {any} */ h) => {
      home = h;
      version = 'later';
    }
  };
}
test('exact current-owner approved model uses native history and shared pointer; replay has no second upload', async () => {
  const f = await fixture(),
    before = structuredClone(f.home());
  const result = await f.publisher.publish(f.input, f.request);
  expect(result.status).toBe('model-applied');
  expect(result.revision).toBe(8);
  expect(f.writes).toHaveLength(2);
  expect(f.home().reconstruction.buildingModel.walls[0].openings[0].widthFeet).toBe(3.5);
  expect(f.home().contacts).toEqual(before.contacts);
  expect(f.home().reconstruction.userOverrides).toEqual(before.reconstruction.userOverrides);
  const pointer = JSON.parse(await readFile(join(f.directory, 'publication.json'), 'utf8'));
  expect(pointer.status).toBe('confirmed');
  expect((await readdir(join(f.directory, 'publications'))).length).toBe(1);
  expect((await f.publisher.publish(f.input, f.request)).status).toBe('model-applied');
  expect(f.writes).toHaveLength(2);
});
test('unapproved, revoked owner, altered digest and changed originals never cause a native upload', async () => {
  for (const kind of ['unapproved', 'role', 'digest', 'source']) {
    const f = await fixture(kind !== 'unapproved');
    if (kind === 'role') f.setRole('contributor');
    if (kind === 'source') f.setOriginal('b'.repeat(64));
    const result = await f.publisher.publish(
      kind === 'digest' ? { ...f.input, digest: 'b'.repeat(64) } : f.input,
      f.request
    );
    expect(result.status).toBe('held-for-review');
    expect(f.writes).toHaveLength(0);
  }
});
test('live maintainer lock and other pending writes block model writes without changing their journals', async () => {
  for (const name of ['lock', 'publication.json', 'admission.json', 'household-refresh.json']) {
    const f = await fixture();
    if (name === 'lock') await mkdir(join(f.directory, '.cycle.lock'), { mode: 0o700 });
    else
      await writeFile(
        join(f.directory, name),
        JSON.stringify({
          homeId: 'example',
          principalId: owner,
          root: '/Example/twin',
          status: 'pending',
          intentId: 'a'.repeat(64)
        }),
        { mode: 0o600 }
      );
    const before = name === 'lock' ? '' : await readFile(join(f.directory, name), 'utf8');
    await f.publisher.publish(f.input, f.request);
    expect(f.writes).toHaveLength(0);
    if (name !== 'lock') expect(await readFile(join(f.directory, name), 'utf8')).toBe(before);
  }
});
test('upload boundary baseline drift stops the home write and uncertain retries never upload again', async () => {
  const f = await fixture();
  f.setDrift();
  expect((await f.publisher.publish(f.input, f.request)).status).toBe('publication-pending');
  expect(f.writes.filter((p) => p.endsWith('/home.json'))).toHaveLength(0);
  const count = f.writes.length;
  await f.publisher.publish(f.input, f.request);
  await f.publisher.resolvePublication(f.input, f.request);
  expect(f.writes).toHaveLength(count);
});
test('lost success is confirmed by exact readback; a failure at unchanged baseline remains pending with no blind replay', async () => {
  const f = await fixture();
  f.setMode('lost-success');
  expect((await f.publisher.publish(f.input, f.request)).status).toBe('model-applied');
  expect(f.writes).toHaveLength(2);
  const g = await fixture();
  g.setMode('reject-write');
  expect((await g.publisher.publish(g.input, g.request)).status).toBe('publication-pending');
  g.setMode('');
  await g.publisher.publish(g.input, g.request);
  expect((await g.publisher.resolvePublication(g.input, g.request)).status).toBe(
    'publication-pending'
  );
  expect(g.writes).toHaveLength(0);
});
test('historical exact target readback resolves an older model approval without overwriting later facts', async () => {
  const f = await fixture();
  await f.publisher.publish(f.input, f.request);
  const target = structuredClone(f.home());
  const ptr = JSON.parse(await readFile(join(f.directory, 'publication.json'), 'utf8'));
  const intent = JSON.parse(
    await readFile(join(f.directory, 'publications', ptr.intentId + '.json'), 'utf8')
  );
  f.files.set('/Example/twin/history/' + intent.targetDigest + '.json', target);
  const later = structuredClone(target);
  later.contacts.push({ id: 'later', name: 'Later' });
  later.revision = 9;
  f.setHome(later);
  const result = await f.publisher.resolvePublication(f.input, f.request);
  expect(result.status).toBe('model-applied');
  expect(result.revision).toBe(8);
  expect(f.home().revision).toBe(9);
  expect(f.writes).toHaveLength(2);
});
test('unknown confirmed shared publication state remains held and is never replaced by a model intent', async () => {
  const f = await fixture(),
    path = join(f.directory, 'publication.json'),
    raw = JSON.stringify({
      homeId: 'example',
      principalId: owner,
      root: '/Example/twin',
      status: 'confirmed',
      intentId: 'c'.repeat(64),
      result: { confirmed: true, intentId: 'c'.repeat(64), revision: 7 }
    });
  await writeFile(path, raw, { mode: 0o600 });
  expect((await f.publisher.publish(f.input, f.request)).status).toBe('held-for-review');
  expect(f.writes).toHaveLength(0);
  expect(await readFile(path, 'utf8')).toBe(raw);
});

test('owner role lost during the final slow native read prevents upload at the effect boundary', async () => {
  const f = await fixture();
  f.setMode('revoke-final-native-read');
  const result = await f.publisher.publish(f.input, f.request);
  expect(result.status).toBe('publication-pending');
  expect(f.writes.filter((p) => p.endsWith('/home.json'))).toHaveLength(0);
  expect(f.home().reconstruction.buildingModel.walls[0].openings[0].widthFeet).toBe(3);
});

test('rollback prepares a new exact owner review; applying it preserves newer unrelated facts and original overrides', async () => {
  const f = await fixture();
  await f.publisher.publish(f.input, f.request);
  const target = structuredClone(f.home()),
    later = structuredClone(target);
  later.revision = 9;
  later.contacts.push({ id: 'newer', name: 'Newer' });
  const ptr = JSON.parse(await readFile(join(f.directory, 'publication.json'), 'utf8')),
    intent = JSON.parse(
      await readFile(join(f.directory, 'publications', ptr.intentId + '.json'), 'utf8')
    );
  f.files.set('/Example/twin/history/' + intent.targetDigest + '.json', target);
  f.setHome(later);
  expect(typeof f.publisher.prepareRollback).toBe('function');
  const count = f.writes.length,
    undo = await f.publisher.prepareRollback(f.input, f.request);
  expect(undo.status).toBe('needs-model-review');
  expect(undo.actionId).not.toBe(f.input.actionId);
  expect(undo.changes[0].before).toBe(3.5);
  expect(undo.changes[0].after).toBe(3);
  expect(undo.baseRevision).toBe(9);
  expect(f.writes).toHaveLength(count);
  const exact = {
    actionId: undo.actionId,
    conversationId: undo.conversationId,
    digest: undo.digest
  };
  expect((await f.publisher.publish(exact, f.request)).status).toBe('held-for-review');
  await f.patch.approve(exact, f.request);
  expect((await f.publisher.publish(exact, f.request)).status).toBe('model-applied');
  expect(f.home().revision).toBe(10);
  expect(f.home().contacts).toEqual(later.contacts);
  expect(f.home().reconstruction.userOverrides).toEqual(later.reconstruction.userOverrides);
  expect(f.home().reconstruction.buildingModel.walls[0].openings[0].widthFeet).toBe(3);
});
test('rollback holds newer model or construction overrides, changed originals, missing target proof and other pending writes', async () => {
  for (const kind of ['model', 'override', 'source', 'proof', 'pending']) {
    const f = await fixture();
    await f.publisher.publish(f.input, f.request);
    const current = structuredClone(f.home());
    if (kind === 'model') current.reconstruction.buildingModel.walls[0].thicknessFeet = 0.6;
    if (kind === 'override')
      current.reconstruction.userOverrides.construction.addition = 'new-choice';
    if (kind === 'source') f.setOriginal('b'.repeat(64));
    if (kind === 'proof') current.contacts.push({ id: 'later' });
    if (['model', 'override', 'proof'].includes(kind)) f.setHome(current);
    if (kind === 'pending') {
      const path = join(f.directory, 'publication.json'),
        ptr = JSON.parse(await readFile(path, 'utf8'));
      await writeFile(path, JSON.stringify({ ...ptr, status: 'pending' }));
    }
    expect(typeof f.publisher.prepareRollback).toBe('function');
    const count = f.writes.length;
    expect((await f.publisher.prepareRollback(f.input, f.request)).status).toBe('held-for-review');
    expect(f.writes).toHaveLength(count);
  }
});

test('a different model appearing at inverse proposal admission is held before any review allocation', async () => {
  const f = await fixture();
  await f.publisher.publish(f.input, f.request);
  const before = await f.patch.list(f.input.conversationId, f.request);
  f.setMode('drift-before-undo-prepare');
  expect((await f.publisher.prepareRollback(f.input, f.request)).status).toBe('held-for-review');
  expect(await f.patch.list(f.input.conversationId, f.request)).toHaveLength(before.length);
});
test('model status requires the current owner and durable exact readback receipt after factory reconstruction', async () => {
  const f = await fixture();
  expect(typeof f.publisher.status).toBe('function');
  expect((await f.publisher.status(f.input, f.request)).status).toBe('model-approval-recorded');
  await f.publisher.publish(f.input, f.request);
  const count = f.writes.length;
  expect((await f.publisher.status(f.input, f.request)).status).toBe('model-applied');
  expect(f.writes).toHaveLength(count);
  f.setRole('contributor');
  expect((await f.publisher.status(f.input, f.request)).status).toBe('held-for-review');
});

test('owner role lost before bound inverse admission cannot persist a contributor rollback proposal', async () => {
  const f = await fixture();
  await f.publisher.publish(f.input, f.request);
  f.setMode('revoke-before-undo-prepare');
  expect((await f.publisher.prepareRollback(f.input, f.request)).status).toBe('held-for-review');
  expect(await f.patch.list(f.input.conversationId, f.request)).toHaveLength(1);
});
