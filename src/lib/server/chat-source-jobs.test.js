import { test, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createChatSourceJobs } from '../../../scripts/chat-source-jobs.mjs';
import { createChatActionPublisher } from '../../../scripts/chat-action-publish.mjs';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'source-jobs-')),
    state = join(directory, 'maintainer');
  await mkdir(state, { mode: 0o700 });
  const owner = '33333333-3333-4333-8333-333333333333',
    id = '11111111-1111-4111-8111-111111111111',
    bytes = Buffer.from('Synthetic source only.');
  const attachment = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    mimeType: 'text/plain',
    extension: 'txt',
    originalName: 'synthetic.txt'
  };
  const record = {
    id,
    homeId: 'example',
    kind: 'evidence',
    value: 'Synthetic original',
    attachment,
    authorUserId: owner,
    recordedAt: '2026-10-01T00:00:00Z'
  };
  const original = {
    record,
    bytes,
    source: {
      id: 'evidence-' + id,
      title: record.value,
      attachment,
      sourceUserId: owner,
      contributionId: id
    }
  };
  const scope = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    role: 'maintainer',
    root: '/Example/twin'
  };
  /** @type {any} */ const current = {
    home: {
      schemaVersion: 1,
      id: 'example',
      revision: 1,
      ownerUserId: owner,
      rooms: [],
      equipment: [],
      sources: [],
      reconstruction: { userOverrides: { keep: true } }
    },
    principalId: owner,
    root: scope.root,
    baselineVersion: 'v1',
    rows: [{ ...record, sourceUserId: owner }],
    sourceChecks: [],
    unavailableMembers: []
  };
  const request = { token: 'current-synthetic-owner-token', homeId: 'example' };
  let writes = 0,
    offline = false,
    lose = false,
    role = 'maintainer',
    boundary = 0,
    committing = false,
    revoke = false;
  const backups = new Map();
  const client = {
    read: async () => {
      if (offline) throw Error('Offline readback');
      const value = structuredClone(current);
      if (revoke && committing && ++boundary === 4) role = 'viewer';
      return value;
    },
    readSnapshot: async (/** @type {any} */ p) => backups.get(p),
    write: async (/** @type {any} */ p, /** @type {any} */ v, /** @type {any} */ before) => {
      if (p.endsWith('/home.json')) committing = true;
      if (before) await before();
      writes++;
      if (p.endsWith('/home.json')) {
        current.home = structuredClone(v);
        current.baselineVersion = 'v' + v.revision;
        if (lose) {
          offline = true;
          throw Error('Lost reply');
        }
      } else backups.set(p, structuredClone(v));
    }
  };
  const options = {
    directory: join(directory, 'jobs'),
    authorize: async (/** @type {any} */ r) => {
      if (r.token !== request.token) throw Error('Wrong token');
      return {
        scope: { ...scope, role },
        home: structuredClone(current.home),
        fileVersion: current.baselineVersion
      };
    },
    sourceFor: async (/** @type {any} */ s) => {
      if (s !== original.source.id) throw Error('Wrong source');
      return original;
    },
    publisherFor: (/** @type {any} */ h, /** @type {any} */ reader) => {
      expect(h).toBe('example');
      return createChatActionPublisher({
        directory: state,
        sourceOnly: true,
        readSourceApproval: reader,
        verifySources: async () => [{ id: original.source.id, sha256: attachment.sha256 }],
        clientFor: () => client
      });
    }
  };
  return {
    directory,
    options,
    request,
    original,
    current,
    make: () => createChatSourceJobs(options),
    get writes() {
      return writes;
    },
    lose() {
      lose = true;
    },
    restore() {
      offline = false;
    },
    revokeAtCommit() {
      revoke = true;
    },
    role(/** @type {string} */ value) {
      role = value;
    }
  };
}
const input = (/** @type {any} */ row) => ({ actionId: row.actionId, digest: row.digest });
test('one explicit owner request survives restart and admits only the exact original once', async () => {
  const f = await fixture(),
    jobs = await f.make(),
    review = await jobs.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(review);
  expect(review.status).toBe('source-review-ready');
  expect(f.writes).toBe(0);
  await expect(jobs.run(i, f.request)).rejects.toThrow();
  const saved = await jobs.request(i, f.request);
  expect(saved.requestSaved).toBe(true);
  expect(f.writes).toBe(0);
  expect(await jobs.request(i, f.request)).toEqual(saved);
  const restarted = await f.make();
  expect((await restarted.run(i, f.request)).status).toBe('accepted');
  expect(f.writes).toBe(2);
  expect(f.current.home.sources.map((/** @type {any} */ x) => x.id)).toEqual([
    f.original.source.id
  ]);
  expect(f.current.home.notes).toEqual([]);
  expect(f.current.home.reconstruction).toEqual({ userOverrides: { keep: true } });
  expect((await restarted.run(i, f.request)).status).toBe('accepted');
  expect(f.writes).toBe(2);
  expect(
    (await restarted.prepare({ sourceId: f.original.source.id }, f.request)).alreadyAccepted
  ).toBe(true);
  const files = await readdir(
    join(f.options.directory, 'example', '33333333-3333-4333-8333-333333333333')
  );
  expect(files.filter((x) => x.endsWith('.review.json'))).toHaveLength(1);
  for (const name of files.filter((x) => x.endsWith('.json')))
    expect(
      await readFile(
        join(f.options.directory, 'example', '33333333-3333-4333-8333-333333333333', name),
        'utf8'
      )
    ).not.toContain(f.request.token);
});
test('lost publication reply is reconciled read-only with the same saved request', async () => {
  const f = await fixture(),
    j = await f.make(),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  await j.request(i, f.request);
  f.lose();
  expect((await j.run(i, f.request)).status).toBe('publication-pending');
  expect(f.writes).toBe(2);
  f.restore();
  expect((await (await f.make()).run(i, f.request)).status).toBe('accepted');
  expect(f.writes).toBe(2);
});
test('revocation during the final commit read blocks the home write through the trusted decision reader', async () => {
  const f = await fixture(),
    j = await f.make(),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  await j.request(i, f.request);
  f.revokeAtCommit();
  await expect(j.run(i, f.request)).rejects.toThrow();
  expect(f.writes).toBe(1);
  expect(f.current.home.revision).toBe(1);
  expect(f.current.home.sources).toEqual([]);
});
test('altered decision, digest and a non-owner cannot publish', async () => {
  const f = await fixture(),
    j = await f.make(),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  await j.request(i, f.request);
  await expect(j.request({ ...i, digest: 'a'.repeat(64) }, f.request)).rejects.toThrow();
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    i.digest + '.decision.json'
  );
  const d = JSON.parse(await readFile(path, 'utf8'));
  d.intent.actionId = '22222222-2222-4222-8222-222222222222';
  await writeFile(path, JSON.stringify(d));
  await expect(j.run(i, f.request)).rejects.toThrow();
  expect(f.writes).toBe(0);
  f.role('contributor');
  await expect(j.prepare({ sourceId: f.original.source.id }, f.request)).rejects.toThrow();
});

test('complete interrupted review and decision stages recover identical bytes while partial state stays held', async () => {
  const f = await fixture(),
    j = await f.make(),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  const base = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    i.digest
  );
  const reviewBytes = await readFile(base + '.review.json');
  await rename(base + '.review.json', base + '.review.json.tmp');
  expect(
    (await (await f.make()).prepare({ sourceId: f.original.source.id }, f.request)).digest
  ).toBe(i.digest);
  expect(await readFile(base + '.review.json')).toEqual(reviewBytes);
  const saved = await j.request(i, f.request),
    decisionBytes = await readFile(base + '.decision.json');
  await rename(base + '.decision.json', base + '.decision.json.tmp');
  await expect(j.run(i, f.request)).rejects.toThrow('Finalized');
  expect(await (await f.make()).request(i, f.request)).toEqual(saved);
  expect(await readFile(base + '.decision.json')).toEqual(decisionBytes);
  await writeFile(base + '.started.json.tmp', '{', { mode: 0o600 });
  await expect(j.run(i, f.request)).rejects.toThrow();
  expect(await readFile(base + '.started.json.tmp', 'utf8')).toBe('{');
  expect(f.writes).toBe(0);
});
test('interruption after retained publication admission never starts another publication', async () => {
  const f = await fixture();
  let calls = 0,
    readbacks = 0;
  const options = {
    ...f.options,
    publisherFor: () => ({
      publish: async () => {
        calls++;
        throw Error('Interrupted');
      },
      resolvePublication: async () => {
        readbacks++;
        return null;
      }
    })
  };
  const j = await createChatSourceJobs(options),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  await j.request(i, f.request);
  expect((await j.run(i, f.request)).status).toBe('publication-pending');
  expect((await (await createChatSourceJobs(options)).run(i, f.request)).status).toBe(
    'publication-pending'
  );
  expect(calls).toBe(1);
  expect(readbacks).toBe(1);
  expect(f.writes).toBe(0);
});
test('stale reviews stay immutable and fifty retained versions remain readable at capacity', async () => {
  const f = await fixture(),
    j = await f.make(),
    rows = [];
  for (let n = 1; n <= 50; n++) {
    f.current.home.revision = n;
    f.current.baselineVersion = 'v' + n;
    rows.push(await j.prepare({ sourceId: f.original.source.id }, f.request));
  }
  await expect(j.request(input(rows[0]), f.request)).rejects.toThrow('stale');
  expect((await j.status(input(rows[0]), f.request)).status).toBe('source-review-ready');
  expect((await j.prepare({ sourceId: f.original.source.id }, f.request)).digest).toBe(
    rows[49].digest
  );
  f.current.home.revision = 51;
  f.current.baselineVersion = 'v51';
  await expect(j.prepare({ sourceId: f.original.source.id }, f.request)).rejects.toThrow(
    'capacity'
  );
  expect(f.writes).toBe(0);
});

test('a complete staged result is not reported final until the same request promotes it', async () => {
  const f = await fixture(),
    jobs = await f.make(),
    row = await jobs.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(row);
  await jobs.request(i, f.request);
  expect((await jobs.run(i, f.request)).status).toBe('accepted');
  const path = join(
    f.options.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    i.digest + '.result.json'
  );
  const bytes = await readFile(path);
  await rename(path, path + '.tmp');
  expect((await (await f.make()).status(i, f.request)).status).toBe('publication-pending');
  expect((await (await f.make()).run(i, f.request)).status).toBe('accepted');
  expect(await readFile(path)).toEqual(bytes);
  expect(f.writes).toBe(2);
});

test('a newer home arriving after the final native read is preserved by the trusted decision boundary', async () => {
  const f = await fixture();
  const options = {
    ...f.options,
    publisherFor: (/** @type {any} */ h, /** @type {any} */ reader) => {
      const publisher = f.options.publisherFor(h, reader);
      return publisher;
    }
  };
  const backups = new Map();
  let inside = false,
    reads = 0,
    writes = 0;
  options.publisherFor = (h, reader) =>
    createChatActionPublisher({
      directory: join(f.directory, 'maintainer'),
      sourceOnly: true,
      readSourceApproval: reader,
      verifySources: async () => [
        { id: f.original.source.id, sha256: f.original.record.attachment.sha256 }
      ],
      clientFor: () => ({
        read: async () => {
          const snapshot = structuredClone(f.current);
          if (inside && ++reads === 4) {
            f.current.home.concurrentRecord = 'must survive';
            f.current.home.revision++;
            f.current.baselineVersion = 'concurrent-version';
          }
          return snapshot;
        },
        readSnapshot: async (/** @type {string} */ path) => backups.get(path) ?? null,
        write: async (
          /** @type {any} */ path,
          /** @type {any} */ value,
          /** @type {any} */ before
        ) => {
          if (path.endsWith('/home.json')) inside = true;
          if (before) await before();
          writes++;
          if (path.endsWith('/home.json')) f.current.home = structuredClone(value);
          else backups.set(path, structuredClone(value));
        }
      })
    });
  const j = await createChatSourceJobs(options),
    r = await j.prepare({ sourceId: f.original.source.id }, f.request),
    i = input(r);
  await j.request(i, f.request);
  expect((await j.run(i, f.request)).status).not.toBe('accepted');
  expect(f.current.home.concurrentRecord).toBe('must survive');
  expect(f.current.home.revision).toBe(2);
  expect(f.current.home.sources).toEqual([]);
  expect(writes).toBe(1);
});
test('parseable malformed decision stage siblings stay held before any native effect', async () => {
  for (const value of [null, false, 0, '']) {
    const f = await fixture(),
      j = await f.make(),
      r = await j.prepare({ sourceId: f.original.source.id }, f.request),
      i = input(r);
    await j.request(i, f.request);
    const path = join(
      f.options.directory,
      'example',
      '33333333-3333-4333-8333-333333333333',
      i.digest + '.decision.json.tmp'
    );
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    await expect(j.run(i, f.request)).rejects.toThrow();
    expect(f.writes).toBe(0);
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(value));
  }
});
