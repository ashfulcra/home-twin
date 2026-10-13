import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { auditHomeSources } from '../../../scripts/source-audit.mjs';
import { buildMaintainerCycle } from './maintainer-cycle.js';
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const home = {
  schemaVersion: 1,
  id: 'example',
  revision: 1,
  ownerUserId: 'owner',
  sources: [
    { id: 'manual', path: '/shared/home-twin/example/sources/manual.md', sha256: sha('old') }
  ],
  equipment: [],
  contacts: [],
  history: [],
  schedules: [],
  rooms: [],
  notes: [],
  contributionEvidence: []
};
const intake = {
  home,
  principalId: 'owner',
  root: '/shared/home-twin/example',
  baselineVersion: 'baseline',
  rows: [],
  unavailableMembers: []
};
const get = async (/** @type {string} */ p) =>
  p.includes('file_upload?')
    ? Response.json({ files: [{ name: 'manual.md', id: 'original' }] })
    : new Response('new');
test('changed original creates stable private review work without changing accepted facts', async () => {
  const sources = await auditHomeSources(home, intake.root, get);
  expect(sources.checks[0]).toMatchObject({
    id: 'manual',
    status: 'changed',
    currentSHA256: sha('new')
  });
  const cycle = buildMaintainerCycle({ ...intake, sourceChecks: sources.checks });
  expect(cycle.work.some((w) => w.kind === 'source-review')).toBe(true);
  expect(cycle.candidate).toEqual(home);
  expect(cycle.remoteWrites).toBe(false);
  expect(cycle.cycleId).toBe(
    buildMaintainerCycle({ ...intake, sourceChecks: sources.checks, ingestedAt: '2026-12-01' })
      .cycleId
  );
  expect(cycle.cycleId).not.toBe(
    buildMaintainerCycle({
      ...intake,
      sourceChecks: [{ ...sources.checks[0], currentSHA256: sha('later') }]
    }).cycleId
  );
  expect(JSON.stringify(sources)).not.toContain('"new"');
});
test('refuses out-of-home paths before reading, including traversal and prefix lookalikes', async () => {
  let calls = 0;
  const sources = await auditHomeSources(
    {
      ...home,
      sources: [
        '/private/secrets',
        '/shared/home-twin/example-other/sources/a',
        '/shared/home-twin/example/sources/../home.json'
      ].map((path, i) => ({ id: String(i), path }))
    },
    intake.root,
    async () => {
      calls++;
      return new Response('secret');
    }
  );
  expect(calls).toBe(0);
  expect(sources.checks.map((s) => s.status)).toEqual([
    'out-of-scope',
    'out-of-scope',
    'out-of-scope'
  ]);
});
test('missing checksum and unavailable files are not unchanged', async () => {
  const unverified = await auditHomeSources(
    { ...home, sources: [{ id: 'manual', path: home.sources[0].path }] },
    intake.root,
    get
  );
  expect(unverified.checks[0].status).toBe('unverified');
  const denied = await auditHomeSources(home, intake.root, async () => {
    throw Error('permission denied');
  });
  expect(denied.checks[0].status).toBe('unavailable');
  expect(
    buildMaintainerCycle({ ...intake, sourceChecks: denied.checks }).work.some(
      (w) => w.kind === 'source-access-blocker'
    )
  ).toBe(true);
});
test('caps original download bytes and does not retain raw content', async () => {
  const result = await auditHomeSources(
    home,
    intake.root,
    async (p) => (p.includes('file_upload?') ? get(p) : new Response('x'.repeat(65))),
    { maxBytes: 64 }
  );
  expect(result.checks[0]).toMatchObject({ status: 'unavailable', reason: 'source-too-large' });
  expect(JSON.stringify(result)).not.toContain('x'.repeat(20));
});
test('explicit legacy audit permits home vault originals but rejects invalid audit roots', async () => {
  const result = await auditHomeSources(
    {
      ...home,
      sources: [{ id: 'manual', path: '/home/smart-home/manual.md', sha256: sha('new') }]
    },
    '/home/twin',
    get
  );
  expect(result.checks[0].status).toBe('unchanged');
  await expect(auditHomeSources(home, '/home/secrets', get)).rejects.toThrow('root');
});
test('revoked attachment author is never read under another account', async () => {
  let calls = 0;
  const result = await auditHomeSources(
    {
      ...home,
      members: [],
      sources: [
        {
          id: 'upload',
          contributionId: '11111111-1111-4111-8111-111111111111',
          sourceUserId: 'revoked-member',
          attachment: {
            sha256: sha('new'),
            sizeBytes: 3,
            mimeType: 'text/plain',
            extension: 'txt',
            originalName: 'note.txt'
          }
        }
      ]
    },
    intake.root,
    async () => {
      calls++;
      return new Response('new');
    }
  );
  expect(calls).toBe(0);
  expect(result.checks[0].status).toBe('out-of-scope');
});

test('chat publication explicitly audits supported large originals without changing the periodic default', async () => {
  const bytes = Buffer.alloc(11 * 1024 * 1024, 120),
    sha256 = createHash('sha256').update(bytes).digest('hex'),
    large = { ...home, sources: [{ ...home.sources[0], sha256 }] };
  const getLarge = async (/** @type {string} */ path) =>
    path.includes('file_upload?')
      ? Response.json({ files: [{ id: 'large', name: 'manual.md' }] })
      : new Response(bytes);
  expect((await auditHomeSources(large, intake.root, getLarge)).checks[0].status).toBe(
    'unavailable'
  );
  const audit = await auditHomeSources(large, intake.root, getLarge, {
    maxBytes: 200 * 1024 * 1024
  });
  expect(audit.checks[0]).toMatchObject({ status: 'unchanged', currentSHA256: sha256 });
  expect(JSON.stringify(audit)).not.toContain('x'.repeat(20));
  await expect(
    auditHomeSources(large, intake.root, getLarge, { maxBytes: 201 * 1024 * 1024 })
  ).rejects.toThrow(/limit/i);
});
