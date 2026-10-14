import { test, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../home/canonical-json.js';
import { buildSourceAdmissionReview } from '../../../scripts/chat-source-admission.mjs';
import { createChatActionPublisher } from '../../../scripts/chat-action-publish.mjs';
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
async function fixture(approved = true) {
  const directory = await mkdtemp(join(tmpdir(), 'source-admission-'));
  const owner = '33333333-3333-4333-8333-333333333333';
  const id = '11111111-1111-4111-8111-111111111111';
  const bytes = Buffer.from('Synthetic file evidence; no physical claim.');
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
  const home = {
    schemaVersion: 1,
    id: 'example',
    revision: 1,
    ownerUserId: owner,
    rooms: [],
    equipment: [],
    sources: [],
    reconstruction: {
      userOverrides: { construction: 'keep' },
      buildingModel: { synthetic: 'unchanged' }
    }
  };
  const scope = {
    homeId: home.id,
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role: 'maintainer'
  };
  const access = { scope, home, fileVersion: 'v1', token: 'exact-current-caller' };
  const prepared = buildSourceAdmissionReview(original, access);
  const context = { proposal: prepared.proposal, digest: prepared.digest };
  const decisionPath = join(directory, 'exact-owner-decision.json');
  if (approved) await writeFile(decisionPath, JSON.stringify(context), { mode: 0o600 });
  /** @type {any} */ const current = {
    home,
    principalId: owner,
    root: scope.root,
    baselineVersion: 'v1',
    unavailableMembers: [],
    sourceChecks: [],
    rows: [
      { ...record, sourceUserId: owner },
      { id: 'other', homeId: home.id, kind: 'note', text: 'Unselected note', authorUserId: owner }
    ]
  };
  const backups = new Map();
  let writes = 0,
    offline = false,
    lost = false;
  const client = {
    read: async () => {
      if (offline) throw Error('Readback unavailable');
      return structuredClone(current);
    },
    readSnapshot: async (/** @type {string} */ path) => backups.get(path) ?? null,
    write: async (
      /** @type {string} */ path,
      /** @type {any} */ value,
      /** @type {any} */ before
    ) => {
      if (before) await before();
      writes++;
      if (path.endsWith('/home.json')) {
        current.home = structuredClone(value);
        current.baselineVersion = 'v' + value.revision;
        if (lost) {
          offline = true;
          throw Error('Lost response');
        }
      } else backups.set(path, structuredClone(value));
    }
  };
  const options = {
    directory,
    sourceOnly: true,
    readSourceApproval: async () => JSON.parse(await readFile(decisionPath, 'utf8')),
    verifySources: async () => [{ id: original.source.id, sha256: attachment.sha256 }],
    clientFor: (/** @type {any} */ h, /** @type {any} */ o, /** @type {any} */ t) => {
      if (h !== home.id || !o.checkSources || t !== access.token) throw Error('Wrong caller');
      return client;
    }
  };
  return {
    client,
    original,
    access,
    prepared,
    context,
    current,
    directory,
    decisionPath,
    options,
    publisher: createChatActionPublisher(options),
    get writes() {
      return writes;
    },
    lose() {
      lost = true;
    },
    restore() {
      offline = false;
    }
  };
}
test('source-only publication keeps the original contribution identity and changes no facts or geometry', async () => {
  const f = await fixture();
  const before = structuredClone(f.access.home.reconstruction);
  expect(f.prepared.record).toEqual(f.original.record);
  expect((await f.publisher.publish(f.prepared.record, f.access, f.context)).status).toBe(
    'accepted'
  );
  expect(f.current.home.sources.map((/** @type {any} */ s) => s.id)).toEqual([
    f.original.source.id
  ]);
  expect(f.current.home.notes).toEqual([]);
  expect(f.current.home.reconstruction).toEqual(before);
  expect(f.current.home.contributionEvidence.map((/** @type {any} */ r) => r.id)).toEqual([
    f.original.record.id
  ]);
  expect(f.writes).toBe(2);
});
test('missing exact private owner decision and normal record mode reject source-only publication', async () => {
  const f = await fixture(false);
  expect((await f.publisher.publish(f.prepared.record, f.access, f.context)).status).toBe(
    'held-for-review'
  );
  expect(f.writes).toBe(0);
  const normal = createChatActionPublisher({ ...f.options, sourceOnly: false });
  expect((await normal.publish(f.prepared.record, f.access, f.context)).status).toBe(
    'held-for-review'
  );
  expect(f.writes).toBe(0);
});
test('source admission rejects foreign authors, altered bytes and injected source metadata before preparation', async () => {
  const f = await fixture();
  for (const change of [
    { record: { ...f.original.record, authorUserId: 'other' } },
    { bytes: Buffer.from('changed') },
    {
      record: {
        ...f.original.record,
        attachment: { ...f.original.record.attachment, unexpected: 'inject' }
      }
    }
  ])
    expect(() => buildSourceAdmissionReview({ ...f.original, ...change }, f.access)).toThrow();
  expect(() =>
    buildSourceAdmissionReview(f.original, {
      ...f.access,
      scope: { ...f.access.scope, role: 'viewer' }
    })
  ).toThrow();
  expect(f.writes).toBe(0);
});
test('source-only uncertain publication reconciles the same native intent without writing twice', async () => {
  const f = await fixture();
  f.lose();
  expect((await f.publisher.publish(f.prepared.record, f.access, f.context)).status).toBe(
    'publication-pending'
  );
  expect(f.writes).toBe(2);
  f.restore();
  expect(await f.publisher.resolvePublication(f.prepared.record, f.access, f.context)).toEqual({
    status: 'accepted',
    revision: 2
  });
  expect(f.writes).toBe(2);
});
test('stale baseline, conflicting original metadata and replaced owner decision hold before effects', async () => {
  for (const mode of ['baseline', 'record', 'decision']) {
    const f = await fixture();
    if (mode === 'baseline') f.current.baselineVersion = 'v2';
    if (mode === 'record') f.current.rows[0].value = 'changed';
    if (mode === 'decision')
      await writeFile(f.decisionPath, JSON.stringify({ ...f.context, digest: 'b'.repeat(64) }));
    expect((await f.publisher.publish(f.prepared.record, f.access, f.context)).status).toBe(
      'held-for-review'
    );
    expect(f.writes).toBe(0);
  }
});

test('removing the owner decision during the final commit read prevents the home write', async () => {
  const f = await fixture();
  const read = f.client.read,
    write = f.client.write;
  let committingHome = false,
    boundaryReads = 0;
  f.client.write = async (
    /** @type {any} */ path,
    /** @type {any} */ value,
    /** @type {any} */ before
  ) => {
    if (path.endsWith('/home.json')) committingHome = true;
    return write(path, value, before);
  };
  f.client.read = async () => {
    const snapshot = await read();
    if (committingHome && ++boundaryReads === 4) await unlink(f.decisionPath);
    return snapshot;
  };
  expect((await f.publisher.publish(f.prepared.record, f.access, f.context)).status).not.toBe(
    'accepted'
  );
  expect(f.writes).toBe(1);
  expect(f.current.home.revision).toBe(1);
  expect(f.current.home.sources).toEqual([]);
});
