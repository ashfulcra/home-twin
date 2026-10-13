import { test, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../home/canonical-json.js';
import { createChatActionPublisher } from '../../../scripts/chat-action-publish.mjs';
const sha = (/** @type {any} */ value) =>
  createHash('sha256').update(canonicalJSON(value)).digest('hex');
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'chat-action-pub-'));
  const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  };
  const home = {
    schemaVersion: 1,
    id: 'example',
    revision: 1,
    ownerUserId: scope.ownerUserId,
    equipment: [],
    rooms: [],
    sources: [{ id: 'manual' }]
  };
  const draft = { kind: 'note', text: 'Synthetic checked manual', sourceIds: ['manual'] };
  const proposal = {
    binding: {
      homeId: scope.homeId,
      principalId: scope.principalId,
      ownerUserId: scope.ownerUserId,
      root: scope.root
    },
    actionId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    turnId: '44444444-4444-4444-8444-444444444444',
    draft,
    baseline: { revision: 1, fileVersion: 'v1', homeDigest: sha(home) },
    sources: [{ id: 'manual', sha256: 'a'.repeat(64) }],
    recordedAt: '2026-10-01T00:00:00Z'
  };
  const record = {
    id: proposal.actionId,
    homeId: scope.homeId,
    ...draft,
    authorUserId: scope.principalId,
    recordedAt: proposal.recordedAt
  };
  /** @type {any} */ let current = {
    home,
    principalId: scope.principalId,
    root: scope.root,
    baselineVersion: 'v1',
    rows: [
      { ...record, sourceUserId: scope.principalId },
      {
        id: 'unreviewed',
        homeId: home.id,
        kind: 'note',
        text: 'Other routine note',
        authorUserId: scope.principalId
      }
    ],
    unavailableMembers: [],
    sourceChecks: [
      {
        id: 'manual',
        status: 'unchanged',
        expectedSHA256: 'a'.repeat(64),
        currentSHA256: 'a'.repeat(64)
      }
    ]
  };
  const backups = new Map();
  let reads = 0,
    changeSourceAt = 0;
  let writes = 0,
    lost = false,
    offline = false;
  /** @type {string[]} */ const tokens = [];
  const transport = {
    read: async () => {
      if (offline) throw Error('Readback unavailable');
      reads++;
      if (reads === changeSourceAt)
        current.sourceChecks[0] = {
          ...current.sourceChecks[0],
          status: 'changed',
          currentSHA256: 'b'.repeat(64)
        };
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
        current.home = value;
        current.baselineVersion = 'v' + value.revision;
        if (lost) {
          offline = true;
          throw Error('Lost response');
        }
      } else backups.set(path, value);
    }
  };
  const publisher = createChatActionPublisher({
    directory,
    clientFor: (
      /** @type {string} */ homeId,
      /** @type {any} */ options,
      /** @type {string} */ token
    ) => {
      tokens.push(token);
      expect(options.checkSources).toBe(true);
      return transport;
    },
    verifySources: async () => proposal.sources
  });
  return {
    directory,
    scope,
    home,
    proposal,
    record,
    current,
    backups,
    context: { proposal, digest: sha(proposal) },
    access: { scope, home, token: 'exact-current-caller', fileVersion: 'v1' },
    publisher,
    tokens,
    get writes() {
      return writes;
    },
    changeSourceOnRead(/** @type {number} */ n) {
      changeSourceAt = n;
    },
    setLost() {
      lost = true;
    },
    restore() {
      offline = false;
    }
  };
}
test('native publication uses the exact caller and accepts only the explicitly reviewed record', async () => {
  const f = await fixture();
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe('accepted');
  expect(f.writes).toBe(2);
  expect(f.current.home.notes.map((/** @type {any} */ x) => x.id)).toEqual([f.record.id]);
  expect(f.tokens).toEqual(['exact-current-caller']);
});
test('stale review, unavailable original and forged approval digest hold before writes', async () => {
  for (const kind of ['baseline', 'source', 'digest']) {
    const f = await fixture();
    if (kind === 'baseline') f.current.baselineVersion = 'v2';
    if (kind === 'source') f.current.sourceChecks[0].status = 'changed';
    if (kind === 'digest') f.context.digest = 'b'.repeat(64);
    expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe(
      'held-for-review'
    );
    expect(f.writes).toBe(0);
  }
});
test('uncertain native publication resolves by exact target readback without another write', async () => {
  const f = await fixture();
  f.setLost();
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe(
    'publication-pending'
  );
  expect(f.writes).toBe(2);
  f.restore();
  expect((await f.publisher.resolvePublication(f.record, f.access, f.context))?.status).toBe(
    'accepted'
  );
  expect(f.writes).toBe(2);
  expect(JSON.parse(await readFile(join(f.directory, 'publication.json'), 'utf8')).status).toBe(
    'confirmed'
  );
});
test('read-only recovery never repairs a missing effect by uploading it', async () => {
  const f = await fixture();
  expect(await f.publisher.resolvePublication(f.record, f.access, f.context)).toBeNull();
  expect(f.writes).toBe(0);
});

test('outer acknowledgement loss resolves a confirmed native operation', async () => {
  const f = await fixture();
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe('accepted');
  expect((await f.publisher.resolvePublication(f.record, f.access, f.context))?.status).toBe(
    'accepted'
  );
  expect(f.writes).toBe(2);
});
test('the final source audit boundary prevents a changed original from becoming accepted', async () => {
  const f = await fixture();
  f.changeSourceOnRead(13);
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).not.toBe('accepted');
  expect(f.writes).toBe(1);
});

test('a prior exact approval remains recoverable after a different publication advances the pointer', async () => {
  const f = await fixture();
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe('accepted');
  const proposal = {
    ...f.proposal,
    actionId: '55555555-5555-4555-8555-555555555555',
    baseline: { revision: 2, fileVersion: 'v2', homeDigest: sha(f.current.home) },
    draft: { ...f.proposal.draft, text: 'Another explicit synthetic note' }
  };
  const record = { ...f.record, id: proposal.actionId, text: proposal.draft.text };
  f.current.rows.push({ ...record, sourceUserId: f.scope.principalId });
  expect(
    (
      await f.publisher.publish(
        record,
        { ...f.access, home: f.current.home, fileVersion: 'v2' },
        { proposal, digest: sha(proposal) }
      )
    ).status
  ).toBe('accepted');
  const pointer = await readFile(join(f.directory, 'publication.json'), 'utf8');
  expect(await f.publisher.resolvePublication(f.record, f.access, f.context)).toEqual({
    status: 'accepted',
    revision: 2
  });
  expect(f.writes).toBe(4);
  expect(await readFile(join(f.directory, 'publication.json'), 'utf8')).toBe(pointer);
});

test('a review association and an accepted-looking current receipt are not historical target proof', async () => {
  const f = await fixture();
  expect((await f.publisher.publish(f.record, f.access, f.context)).status).toBe('accepted');
  const prior = structuredClone(f.current.home),
    proposal = {
      ...f.proposal,
      actionId: '55555555-5555-4555-8555-555555555555',
      baseline: { revision: 2, fileVersion: 'v2', homeDigest: sha(prior) },
      draft: { ...f.proposal.draft, text: 'Second explicit synthetic note' }
    };
  const record = { ...f.record, id: proposal.actionId, text: proposal.draft.text };
  f.current.rows.push({ ...record, sourceUserId: f.scope.principalId });
  expect(
    (
      await f.publisher.publish(
        record,
        { ...f.access, home: prior, fileVersion: 'v2' },
        { proposal, digest: sha(proposal) }
      )
    ).status
  ).toBe('accepted');
  f.backups.delete(f.scope.root + '/history/' + sha(prior) + '.json');
  expect(await f.publisher.resolvePublication(f.record, f.access, f.context)).toBeNull();
  expect(f.writes).toBe(4);
});
