import { test, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatActions } from '../../../scripts/chat-actions.mjs';
const owner = '33333333-3333-4333-8333-333333333333',
  conversationId = '11111111-1111-4111-8111-111111111111',
  turnId = '22222222-2222-4222-8222-222222222222';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'chat-actions-'));
  let role = 'maintainer',
    revision = 1,
    writes = 0,
    hidden = false,
    sourceHash = 'a'.repeat(64),
    published = 0;
  const files = new Map();
  const scope = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role
  };
  const authorize = async () => ({
    scope: { ...scope, role },
    home: {
      schemaVersion: 1,
      id: 'example',
      ownerUserId: owner,
      revision,
      equipment: [],
      rooms: [],
      sources: [{ id: 'manual' }]
    },
    fileVersion: 'v' + revision
  });
  const options = {
    directory,
    authorize,
    verifySources: async () => [{ id: 'manual', sha256: sourceHash }],
    ioFor: () => ({
      read: async (/** @type {string} */ p) => (hidden ? null : (files.get(p) ?? null)),
      write: async (
        /** @type {string} */ p,
        /** @type {Uint8Array} */ b,
        /** @type {string} */ m,
        /** @type {()=>Promise<void>} */ before
      ) => {
        await before();
        writes++;
        files.set(p, Buffer.from(b));
      }
    }),
    publish: async () => {
      published++;
      return { status: 'accepted', revision: revision + 1 };
    },
    secretsFor: () => ['synthetic-provider-key']
  };
  let actions = await createChatActions(options);
  const request = { token: 'synthetic-caller', homeId: 'example' },
    context = { conversationId, turnId },
    draft = { kind: 'note', text: 'Synthetic manual guidance', sourceIds: ['manual'] };
  return {
    directory,
    options,
    request,
    context,
    draft,
    actions,
    files,
    get writes() {
      return writes;
    },
    get published() {
      return published;
    },
    setRole: (/** @type {string} */ x) => (role = x),
    setRevision: (/** @type {number} */ x) => (revision = x),
    setHidden: (/** @type {boolean} */ x) => (hidden = x),
    setSource: (/** @type {string} */ x) => (sourceHash = x)
  };
}
test('preparing a proposal makes no cloud effect and stable retries recover the same review', async () => {
  const f = await fixture();
  const a = await f.actions.prepare(f.draft, f.context, f.request),
    b = await f.actions.prepare(f.draft, f.context, f.request);
  expect(a).toEqual(b);
  expect(f.writes).toBe(0);
  expect(f.published).toBe(0);
  expect(a.status).toBe('proposed');
  expect((await f.actions.list(conversationId, f.request))[0]).toEqual(a);
  f.actions = await createChatActions(f.options);
  expect(await f.actions.prepare(f.draft, f.context, f.request)).toEqual(a);
});
test('only the exact reviewed proposal can save one current-caller record and publish routine owner changes', async () => {
  const f = await fixture(),
    a = await f.actions.prepare(f.draft, f.context, f.request);
  const approval = { conversationId, actionId: a.actionId, digest: a.digest };
  await expect(f.actions.apply({ ...approval, digest: 'b'.repeat(64) }, f.request)).rejects.toThrow(
    /review|digest/i
  );
  expect(f.writes).toBe(0);
  const saved = await f.actions.apply(approval, f.request);
  expect(saved.status).toBe('accepted');
  expect(f.writes).toBe(1);
  expect(JSON.parse([...f.files.values()][0]).authorUserId).toBe(owner);
  expect(JSON.parse([...f.files.values()][0]).sourceIds).toEqual(['manual']);
  expect((await f.actions.apply(approval, f.request)).status).toBe('accepted');
  expect(f.writes).toBe(1);
});
test('current role, baseline and original checksums are rechecked before effects', async () => {
  for (const change of ['role', 'baseline', 'source']) {
    const f = await fixture(),
      a = await f.actions.prepare(f.draft, f.context, f.request);
    if (change === 'role') f.setRole('viewer');
    if (change === 'baseline') f.setRevision(2);
    if (change === 'source') f.setSource('c'.repeat(64));
    await expect(
      f.actions.apply({ conversationId, actionId: a.actionId, digest: a.digest }, f.request)
    ).rejects.toThrow();
    expect(f.writes).toBe(0);
  }
});
test('uncertain writes never repeat and are reconciled from the same exact intent', async () => {
  const f = await fixture(),
    a = await f.actions.prepare(f.draft, f.context, f.request),
    approval = { conversationId, actionId: a.actionId, digest: a.digest };
  f.setHidden(true);
  expect((await f.actions.apply(approval, f.request)).status).toBe('pending-readback');
  expect(f.writes).toBe(1);
  expect((await f.actions.apply(approval, f.request)).status).toBe('pending-readback');
  expect(f.writes).toBe(1);
  f.setHidden(false);
  expect((await f.actions.apply(approval, f.request)).status).toBe('accepted');
  expect(f.writes).toBe(1);
});
test('credentials and cross-conversation approval fail before persistence or writes', async () => {
  const f = await fixture();
  await expect(
    f.actions.prepare({ ...f.draft, text: 'synthetic-provider-key' }, f.context, f.request)
  ).rejects.toThrow(/credential/i);
  const a = await f.actions.prepare(f.draft, f.context, f.request);
  await expect(
    f.actions.apply({ conversationId: turnId, actionId: a.actionId, digest: a.digest }, f.request)
  ).rejects.toThrow();
  expect(f.writes).toBe(0);
});

test('one conversation can list its review while another has corrupt private state', async () => {
  const f = await fixture();
  const a = await f.actions.prepare(f.draft, f.context, f.request);
  await f.actions.prepare(f.draft, { ...f.context, conversationId: turnId }, f.request);
  await writeFile(
    join(f.directory, 'example', owner, turnId, a.actionId + '.json'),
    'invalid journal',
    { mode: 0o600 }
  );
  expect(await f.actions.list(conversationId, f.request)).toEqual([a]);
  await expect(f.actions.list(turnId, f.request)).rejects.toThrow();
});

test('revocation during original verification prevents the final contribution write', async () => {
  const f = await fixture();
  const a = await f.actions.prepare(f.draft, f.context, f.request);
  let verifies = 0;
  f.options.verifySources = async () => {
    verifies++;
    if (verifies === 2) f.setRole('viewer');
    return [{ id: 'manual', sha256: 'a'.repeat(64) }];
  };
  const actions = await createChatActions(f.options);
  expect(
    (await actions.apply({ conversationId, actionId: a.actionId, digest: a.digest }, f.request))
      .status
  ).toBe('pending-readback');
  expect(f.writes).toBe(0);
});
test('pending contribution readback cannot publish against a changed reviewed baseline or source', async () => {
  const f = await fixture();
  const a = await f.actions.prepare(f.draft, f.context, f.request);
  const approval = { conversationId, actionId: a.actionId, digest: a.digest };
  f.setHidden(true);
  expect((await f.actions.apply(approval, f.request)).status).toBe('pending-readback');
  f.setHidden(false);
  f.setRevision(2);
  f.setSource('c'.repeat(64));
  await expect(f.actions.apply(approval, f.request)).rejects.toThrow();
  expect(f.published).toBe(0);
  expect(f.writes).toBe(1);
});
test('an oversized multilingual review fails prepare rather than becoming an unreadable saved action', async () => {
  const f = await fixture();
  await expect(
    f.actions.prepare(
      {
        ...f.draft,
        text: '界'.repeat(10000),
        value: '界'.repeat(500),
        field: '界'.repeat(500),
        phone: '界'.repeat(500),
        email: '界'.repeat(500)
      },
      f.context,
      f.request
    )
  ).rejects.toThrow(/bound|long|limit/i);
  expect(await f.actions.list(conversationId, f.request)).toEqual([]);
  expect(f.writes).toBe(0);
});
test('uncertain publication never repeats a mutating publisher on an exact approval retry', async () => {
  const f = await fixture();
  let calls = 0;
  f.options.publish = async () => {
    calls++;
    throw Error('uncertain publication');
  };
  const actions = await createChatActions(f.options);
  const a = await actions.prepare(f.draft, f.context, f.request),
    approval = { conversationId, actionId: a.actionId, digest: a.digest };
  await actions.apply(approval, f.request).catch(() => {});
  await actions.apply(approval, f.request).catch(() => {});
  expect(calls).toBe(1);
  expect((await actions.list(conversationId, f.request))[0].status).toBe('publication-pending');
});

test('a publication retry after restart uses only read-only resolution of the original reviewed evidence', async () => {
  const f = await fixture();
  let calls = 0,
    resolves = 0;
  /** @type {any} */ let approved;
  /** @type {any} */ const options = {
    ...f.options,
    publish: async (
      /** @type {any} */ record,
      /** @type {any} */ access,
      /** @type {any} */ context
    ) => {
      calls++;
      approved = context;
      throw Error('response lost');
    },
    resolvePublication: async (
      /** @type {any} */ record,
      /** @type {any} */ access,
      /** @type {any} */ context
    ) => {
      resolves++;
      expect(context).toEqual(approved);
      return { status: 'accepted', revision: 2 };
    }
  };
  let actions = await createChatActions(options);
  const a = await actions.prepare(f.draft, f.context, f.request),
    approval = { conversationId, actionId: a.actionId, digest: a.digest };
  expect((await actions.apply(approval, f.request)).status).toBe('publication-pending');
  expect(approved.proposal.baseline.revision).toBe(1);
  expect(approved.proposal.sources).toEqual([{ id: 'manual', sha256: 'a'.repeat(64) }]);
  actions = await createChatActions(options);
  expect((await actions.apply(approval, f.request)).status).toBe('accepted');
  expect(calls).toBe(1);
  expect(resolves).toBe(1);
  expect(f.writes).toBe(1);
});

test('preparation reserves bytes for pending and accepted lifecycle results', async () => {
  const f = await fixture(),
    fields = {
      value: '界'.repeat(500),
      field: '界'.repeat(500),
      phone: '界'.repeat(500),
      email: '界'.repeat(500)
    };
  await expect(
    f.actions.prepare({ ...f.draft, ...fields, text: '界'.repeat(8000) }, f.context, f.request)
  ).rejects.toThrow(/limit/i);
  expect(f.writes).toBe(0);
  const a = await f.actions.prepare(
    { ...f.draft, ...fields, text: '界'.repeat(7000) },
    f.context,
    f.request
  );
  expect(
    (await f.actions.apply({ conversationId, actionId: a.actionId, digest: a.digest }, f.request))
      .status
  ).toBe('accepted');
  expect(f.writes).toBe(1);
});
