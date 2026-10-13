import { test, expect } from 'vitest';
import { saveEvidence } from './evidence.js';
import { validAttachment, MAX_SOURCE_BYTES } from '../home/attachments.js';
test('large resumable original metadata is supported while legacy inline uploads stay bounded', () => {
  expect(
    validAttachment({
      sha256: 'a'.repeat(64),
      sizeBytes: 178 * 1024 * 1024,
      mimeType: 'application/pdf',
      extension: 'pdf',
      originalName: 'plan.pdf'
    })
  ).toBe(true);
  expect(MAX_SOURCE_BYTES).toBe(3 * 1024 * 1024);
});
const id = '11111111-1111-4111-8111-111111111111';
const access = {
  userId: 'owner',
  ownerUserId: 'owner',
  role: 'maintainer',
  root: '/shared/home-twin/example',
  home: { id: 'example', equipment: [{ id: 'boiler' }] }
};
function storage() {
  const files = new Map();
  let writes = 0;
  return {
    files,
    get writes() {
      return writes;
    },
    async list() {
      return [...files.entries()]
        .filter(([p]) => p.includes('/contributions/'))
        .map(([, v]) => JSON.parse(new TextDecoder().decode(v)));
    },
    async read(/** @type {string} */ path) {
      return files.get(path) ?? null;
    },
    async write(/** @type {string} */ path, /** @type {Uint8Array} */ bytes) {
      writes++;
      files.set(path, bytes);
    }
  };
}
const bytes = new TextEncoder().encode('Synthetic service invoice. No real household data.');
const input = { id, homeId: 'example', title: 'Invoice', entityId: 'boiler' };
test('original private bytes and metadata persist; identical retries create one source', async () => {
  const io = storage();
  const first = await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  expect(first.status).toBe('saved');
  expect(io.writes).toBe(3);
  const retry = await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  expect(retry.reused).toBe(true);
  expect(io.writes).toBe(3);
  const c = (await io.list())[0];
  expect(c).toMatchObject({
    kind: 'evidence',
    authorUserId: 'owner',
    entityId: 'boiler',
    attachment: { sizeBytes: bytes.length, mimeType: 'text/plain' }
  });
  expect(c.attachment.sha256).toHaveLength(64);
  expect([...io.files.keys()].every((p) => p.startsWith(access.root + '/'))).toBe(true);
  expect([...io.files.entries()].find(([path]) => path.includes('/sources/'))?.[1]).toEqual(bytes);
});
test('changed bytes or metadata under stable ID never overwrite originals', async () => {
  const io = storage();
  await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  for (const [i, b] of /** @type {Array<[any,Uint8Array]>} */ ([
    [{ ...input, title: 'Different' }, bytes],
    [input, new TextEncoder().encode('Different bytes')]
  ]))
    await expect(saveEvidence(access, i, b, 'text/plain', 'invoice.txt', io)).rejects.toThrow(
      'different'
    );
  expect(io.writes).toBe(3);
});
test('viewer, wrong home/entity, active formats, false signatures and oversize fail before writes', async () => {
  const io = storage();
  await expect(
    saveEvidence({ ...access, role: 'viewer' }, input, bytes, 'text/plain', 'invoice.txt', io)
  ).rejects.toThrow('read-only');
  for (const i of [
    { ...input, homeId: 'other' },
    { ...input, entityId: 'missing' }
  ])
    await expect(saveEvidence(access, i, bytes, 'text/plain', 'invoice.txt', io)).rejects.toThrow();
  for (const [b, type] of /** @type {Array<[Uint8Array,string]>} */ ([
    [bytes, 'text/html'],
    [bytes, 'image/svg+xml'],
    [bytes, 'application/pdf'],
    [new Uint8Array(3 * 1024 * 1024 + 1), 'text/plain']
  ]))
    await expect(saveEvidence(access, input, b, type, 'x', io)).rejects.toThrow();
  expect(io.writes).toBe(0);
});
test('uncertain metadata readback retains stable payload and raw upload for retry', async () => {
  const io = storage();
  const read = io.read;
  let hide = true;
  io.read = async (path) => (path.includes('/contributions/') && hide ? null : read(path));
  expect((await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io)).status).toBe(
    'pending-readback'
  );
  hide = false;
  expect((await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io)).status).toBe(
    'saved'
  );
  expect(io.writes).toBe(3);
});

import { sourceLocation } from './source-location.js';
import { reconcileContributions } from '../home/contributions.js';
import { projectHome } from '../home/projection.js';
test('source evidence links equipment without inventing facts, service or verification', async () => {
  const io = storage();
  await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  const c = (await io.list())[0];
  const result = reconcileContributions(access.home, [{ ...c, sourceUserId: 'owner' }]);
  expect(result.review).toEqual([]);
  const home = projectHome(result.home, new Date().toISOString());
  expect(home.sources[0].freshness).toBe('unknown');
  expect(home.equipment[0].lastService).toBeNull();
  expect(home.equipment[0].model).toBeUndefined();
  expect(home.equipment[0].sources[0].id).toBe('evidence-' + id);
  expect(sourceLocation(access, home.sources[0]).path).toContain('/sources/' + id + '-');
});
test('foreign sources require registered contributor and home-scoped derived path', () => {
  const source = {
    contributionId: id,
    sourceUserId: 'member',
    attachment: {
      sha256: 'a'.repeat(64),
      sizeBytes: 10,
      mimeType: 'text/plain',
      extension: 'txt',
      originalName: '../../home.txt'
    }
  };
  expect(() => sourceLocation(access, source)).toThrow('revoked');
  const shared = {
    ...access,
    userId: 'viewer',
    home: { ...access.home, members: [{ userId: 'member', role: 'contributor' }] }
  };
  expect(sourceLocation(shared, source)).toMatchObject({
    userId: 'member',
    path: access.root + '/sources/' + id + '-' + 'a'.repeat(64) + '.txt'
  });
  expect(() => sourceLocation(shared, { path: '/home/unrelated.md' })).toThrow('outside');
  expect(() => sourceLocation(shared, { ...source, contributionId: '../outside' })).toThrow();
});

test('accepted evidence cannot be replaced through a reused contribution identity', async () => {
  const io = storage();
  await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  const c = (await io.list())[0];
  const baseline = reconcileContributions(access.home, [c]).home;
  const altered = {
    ...c,
    value: 'Different title',
    attachment: { ...c.attachment, sha256: 'b'.repeat(64) }
  };
  const replay = reconcileContributions(baseline, [altered]);
  expect(replay.review[0]?.reason).toBe('accepted-id-collision');
  expect(replay.home.sources[0].attachment.sha256).toBe(c.attachment.sha256);
});
import { readBoundedBytes } from './fulcra-files.js';
test('streamed sources enforce limits without trusting a missing or false length header', async () => {
  const request = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(7));
        c.enqueue(new Uint8Array(7));
        c.close();
      }
    })
  );
  await expect(readBoundedBytes(request, 10)).rejects.toThrow('limit');
  const small = await readBoundedBytes(new Response(new Uint8Array([1, 2, 3])), 10);
  expect(small).toEqual(new Uint8Array([1, 2, 3]));
});

test('concurrent different payloads cannot both confirm the same source ID', async () => {
  const io = storage();
  const r = await Promise.allSettled([
    saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io),
    saveEvidence(
      access,
      { ...input, title: 'Other' },
      new TextEncoder().encode('Other'),
      'text/plain',
      'invoice.txt',
      io
    )
  ]);
  expect(
    r.filter((x) => x.status === 'fulfilled' && x.value.status === 'saved').length
  ).toBeLessThan(2);
  expect((await io.list()).filter((c) => c.kind === 'evidence')).toHaveLength(1);
});
test('failed metadata publication binds identity before any original bytes can be orphaned', async () => {
  const io = storage();
  const write = io.write;
  let fail = true;
  io.write = async (path, b) => {
    await write(path, b);
    if (path.includes('/contributions/') && fail) {
      fail = false;
      throw new Error('Uncertain metadata write');
    }
  };
  await expect(saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io)).rejects.toThrow(
    'Uncertain'
  );
  expect([...io.files.keys()].some((path) => path.includes('/sources/'))).toBe(false);
  await expect(
    saveEvidence(
      access,
      input,
      new TextEncoder().encode('Changed'),
      'text/plain',
      'invoice.txt',
      io
    )
  ).rejects.toThrow('different');
  const retry = await saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io);
  expect(retry.status).toBe('saved');
});

test('simultaneous identical retries serialize one original upload in this runtime', async () => {
  const io = storage();
  const results = await Promise.all([
    saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io),
    saveEvidence(access, input, bytes, 'text/plain', 'invoice.txt', io)
  ]);
  expect(results.every((r) => r.status === 'saved')).toBe(true);
  expect(results.some((r) => r.reused)).toBe(true);
  expect(io.writes).toBe(3);
});
