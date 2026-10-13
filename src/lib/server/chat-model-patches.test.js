import { test, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatModelPatches } from '../../../scripts/chat-model-patches.mjs';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'model-preview-'));
  let home = modelPatchHome(),
    role = 'maintainer';
  const owner = '33333333-3333-4333-8333-333333333333';
  home.ownerUserId = owner;
  const authorize = async () => ({
    scope: { homeId: home.id, principalId: owner, ownerUserId: owner, root: '/Example/twin', role },
    home,
    fileVersion: 'v' + home.revision
  });
  const options = {
    directory,
    authorize,
    verifySources: async () => [{ id: 'manual', sha256: 'a'.repeat(64) }],
    secretsFor: () => ['synthetic-model-key']
  };
  return {
    directory,
    options,
    home,
    setRole: (/** @type {string} */ r) => (role = r),
    request: { token: 'synthetic-caller', homeId: 'example' },
    context: {
      conversationId: '11111111-1111-4111-8111-111111111111',
      turnId: '22222222-2222-4222-8222-222222222222'
    },
    patch: await createChatModelPatches(options)
  };
}
test('preparation is private and immutable; same exact turn retry recovers the original version-bound review', async () => {
  const f = await fixture(),
    raw = JSON.stringify(f.home);
  const a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    b = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  expect(a).toEqual(b);
  expect(a.status).toBe('needs-model-review');
  expect(a.majorReviewRequired).toBe(true);
  expect(a.changes[0].after).toBe(3.5);
  expect(JSON.stringify(f.home)).toBe(raw);
  const recovered = await createChatModelPatches(f.options);
  expect((await recovered.list(f.context.conversationId, f.request))[0].digest).toBe(a.digest);
  expect('apply' in recovered).toBe(false);
});
test('viewer denial and an empty conversation read create no private proposal or capacity entry', async () => {
  const f = await fixture();
  expect(await f.patch.list(f.context.conversationId, f.request)).toEqual([]);
  expect(await readdir(f.directory)).toEqual([]);
  f.setRole('viewer');
  await expect(f.patch.prepare(modelPatchDraft(), f.context, f.request)).rejects.toThrow();
  expect(await readdir(f.directory)).toEqual([]);
});
test('current home/version changes make a stored preview stale and original-read failures prevent new preparation', async () => {
  const f = await fixture();
  const a = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  f.home.revision++;
  expect((await f.patch.list(f.context.conversationId, f.request))[0].status).toBe('stale-model');
  expect((await f.patch.prepare(modelPatchDraft(), f.context, f.request)).digest).toBe(a.digest);
  const options = {
    ...f.options,
    verifySources: async () => {
      throw Error('Original inaccessible');
    }
  };
  const p = await createChatModelPatches(options);
  await expect(
    p.prepare(
      modelPatchDraft(),
      { ...f.context, turnId: '44444444-4444-4444-8444-444444444444' },
      f.request
    )
  ).rejects.toThrow(/inaccessible/);
});
test('revocation during original verification prevents persistence; source instructions never grant authority', async () => {
  const f = await fixture();
  const p = await createChatModelPatches({
    ...f.options,
    verifySources: async () => {
      f.setRole('viewer');
      return [{ id: 'manual', sha256: 'a'.repeat(64) }];
    }
  });
  await expect(p.prepare(modelPatchDraft(), f.context, f.request)).rejects.toThrow();
  expect(await readdir(f.directory)).toEqual([]);
});
test('credential-like proposal text is rejected before any private persistence', async () => {
  const f = await fixture();
  await expect(
    f.patch.prepare({ ...modelPatchDraft(), note: 'synthetic-model-key' }, f.context, f.request)
  ).rejects.toThrow(/credential/i);
  expect(await readdir(f.directory)).toEqual([]);
});
async function proposalFile(/** @type {any} */ f, /** @type {any} */ a) {
  return join(
    f.directory,
    'example',
    '33333333-3333-4333-8333-333333333333',
    f.context.conversationId,
    a.actionId + '.json'
  );
}
const numbered = (/** @type {number} */ n) =>
  n.toString(16).padStart(8, '0') + '-4444-4444-8444-444444444444';
test('stored proposals omit raw home, original bytes and credentials; retries never rewrite the saved intent', async () => {
  const f = await fixture(),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    path = await proposalFile(f, a),
    raw = await readFile(path, 'utf8');
  expect(raw).not.toContain('synthetic-caller');
  expect(raw).not.toContain('synthetic-model-key');
  expect(raw).not.toContain('userOverrides');
  expect(raw).not.toContain('contacts');
  expect(raw).not.toContain('floorEnvelopes');
  f.home.reconstruction.buildingModel.walls[0].openings[0].widthFeet = 4;
  const recovered = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  expect(recovered.digest).toBe(a.digest);
  expect(recovered.status).toBe('stale-model');
  expect(await readFile(path, 'utf8')).toBe(raw);
});
test('tampered intent content is held, never silently overwritten by prepare or list', async () => {
  const f = await fixture(),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    path = await proposalFile(f, a),
    j = JSON.parse(await readFile(path, 'utf8'));
  j.proposal.changes[0].after = 4;
  await writeFile(path, JSON.stringify(j));
  await expect(f.patch.list(f.context.conversationId, f.request)).rejects.toThrow(/integrity/);
  await expect(f.patch.prepare(modelPatchDraft(), f.context, f.request)).rejects.toThrow(
    /integrity/
  );
  expect(JSON.parse(await readFile(path, 'utf8')).proposal.changes[0].after).toBe(4);
});
test('different current owner/root cannot reinterpret another saved review and a different caller cannot see it', async () => {
  const f = await fixture();
  await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  const other = await createChatModelPatches({
    ...f.options,
    authorize: async () => ({
      ...(await f.options.authorize()),
      scope: {
        ...(await f.options.authorize()).scope,
        principalId: '55555555-5555-4555-8555-555555555555',
        role: 'contributor'
      }
    })
  });
  expect(await other.list(f.context.conversationId, f.request)).toEqual([]);
  const different = await createChatModelPatches({
    ...f.options,
    authorize: async () => ({
      ...(await f.options.authorize()),
      scope: { ...(await f.options.authorize()).scope, root: '/Different/twin' }
    })
  });
  await expect(different.list(f.context.conversationId, f.request)).rejects.toThrow(/scope/);
});
test('home changes while originals are checked prevent any proposal persistence', async () => {
  const f = await fixture(),
    p = await createChatModelPatches({
      ...f.options,
      verifySources: async () => {
        f.home.contacts.push({ id: 'new', name: 'New' });
        return [{ id: 'manual', sha256: 'a'.repeat(64) }];
      }
    });
  await expect(p.prepare(modelPatchDraft(), f.context, f.request)).rejects.toThrow(/changed/);
  expect(await readdir(f.directory)).toEqual([]);
});
test('missing, duplicate and malformed original receipts fail before private allocation', async () => {
  for (const rows of [
    [],
    [{ id: 'manual', sha256: 'bad' }],
    [{ id: 'elsewhere', sha256: 'a'.repeat(64) }],
    [
      { id: 'manual', sha256: 'a'.repeat(64) },
      { id: 'manual', sha256: 'a'.repeat(64) }
    ]
  ]) {
    const f = await fixture(),
      p = await createChatModelPatches({ ...f.options, verifySources: async () => rows });
    await expect(p.prepare(modelPatchDraft(), f.context, f.request)).rejects.toThrow(
      /verification/
    );
    expect(await readdir(f.directory)).toEqual([]);
  }
});
test('thirty retained conversations do not prevent empty reads or retry of an existing intent; the next allocation is held', async () => {
  const f = await fixture();
  for (let n = 1; n <= 30; n++)
    await f.patch.prepare(
      modelPatchDraft(),
      { conversationId: numbered(n), turnId: f.context.turnId },
      f.request
    );
  expect(await f.patch.list(numbered(31), f.request)).toEqual([]);
  await expect(
    f.patch.prepare(
      modelPatchDraft(),
      { conversationId: numbered(31), turnId: f.context.turnId },
      f.request
    )
  ).rejects.toThrow(/capacity/);
  expect(
    (
      await f.patch.prepare(
        modelPatchDraft(),
        { conversationId: numbered(1), turnId: f.context.turnId },
        f.request
      )
    ).status
  ).toBe('needs-model-review');
  expect(
    (await readdir(join(f.directory, 'example', '33333333-3333-4333-8333-333333333333'))).filter(
      (n) => !n.startsWith('.')
    )
  ).toHaveLength(30);
});
test('fifty total proposals remain recoverable and prevent further proposal allocation', async () => {
  const f = await fixture();
  for (let n = 1; n <= 50; n++)
    await f.patch.prepare(modelPatchDraft(), { ...f.context, turnId: numbered(n) }, f.request);
  expect(await f.patch.list(f.context.conversationId, f.request)).toHaveLength(50);
  await expect(
    f.patch.prepare(modelPatchDraft(), { ...f.context, turnId: numbered(51) }, f.request)
  ).rejects.toThrow(/capacity/);
  expect(
    (await f.patch.prepare(modelPatchDraft(), { ...f.context, turnId: numbered(1) }, f.request))
      .status
  ).toBe('needs-model-review');
});
test('concurrent exact prepares either coalesce or return retryable lock contention; recovery retains one immutable file', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.patch.prepare(modelPatchDraft(), f.context, f.request),
    f.patch.prepare(modelPatchDraft(), f.context, f.request)
  ]);
  expect(results.filter((x) => x.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  const recovered = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  const all = await f.patch.list(f.context.conversationId, f.request);
  expect(all).toHaveLength(1);
  expect(all[0].digest).toBe(recovered.digest);
});

test('a crash before linking a complete stage recovers the original proposal; partial stages hold only that action', async () => {
  const f = await fixture(),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    path = await proposalFile(f, a);
  await rename(path, path + '.tmp');
  const recovered = await createChatModelPatches(f.options);
  expect((await recovered.prepare(modelPatchDraft(), f.context, f.request)).digest).toBe(a.digest);
  expect(await recovered.list(f.context.conversationId, f.request)).toHaveLength(1);
  const partial = join(path, '..', numbered(60) + '.json.tmp');
  await writeFile(partial, '{', { mode: 0o600 });
  expect(await recovered.list(f.context.conversationId, f.request)).toHaveLength(1);
  expect(
    (
      await recovered.prepare(
        modelPatchDraft(),
        { ...f.context, conversationId: numbered(61) },
        f.request
      )
    ).status
  ).toBe('needs-model-review');
  expect(await readFile(partial, 'utf8')).toBe('{');
});
test('a crash after linking does not let a staging remnant block valid list or a new prepare', async () => {
  const f = await fixture(),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    path = await proposalFile(f, a);
  await writeFile(path + '.tmp', await readFile(path), { mode: 0o600 });
  const restarted = await createChatModelPatches(f.options);
  expect(await restarted.list(f.context.conversationId, f.request)).toHaveLength(1);
  expect((await restarted.prepare(modelPatchDraft(), f.context, f.request)).digest).toBe(a.digest);
  expect(
    (await restarted.prepare(modelPatchDraft(), { ...f.context, turnId: numbered(62) }, f.request))
      .status
  ).toBe('needs-model-review');
});
test('an exact current preview returns only affected wall plan and elevation data without mutating or copying home metadata', async () => {
  const f = await fixture(),
    raw = JSON.stringify(f.home),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  const p = await f.patch.preview(
    { actionId: a.actionId, conversationId: a.conversationId, digest: a.digest },
    f.request
  );
  expect(p.units).toBe('feet');
  expect(p.levelId).toBe('main');
  expect(p.walls).toHaveLength(1);
  expect(p.walls[0].before.openings[0].widthFeet).toBe(3);
  expect(p.walls[0].after.openings[0].widthFeet).toBe(3.5);
  expect(p.walls[0].start).toEqual([0, 0]);
  expect(p.review.sourceVerification).toBe('prepared-version-only');
  expect(JSON.stringify(p)).not.toContain('userOverrides');
  expect(JSON.stringify(p)).not.toContain('unknownMetadata');
  expect(JSON.stringify(f.home)).toBe(raw);
});
test('preview requires exact saved digest and current home version; a viewer cannot read or recover it', async () => {
  const f = await fixture(),
    a = await f.patch.prepare(modelPatchDraft(), f.context, f.request),
    input = { actionId: a.actionId, conversationId: a.conversationId, digest: a.digest };
  await expect(f.patch.preview({ ...input, digest: 'b'.repeat(64) }, f.request)).rejects.toThrow(
    /digest/
  );
  f.home.revision++;
  await expect(f.patch.preview(input, f.request)).rejects.toThrow(/changed|stale/);
  f.home.revision--;
  f.setRole('viewer');
  await expect(f.patch.preview(input, f.request)).rejects.toThrow(/role/);
});
test('an untouched opening with a non-scalar identity cannot carry metadata into preview display', async () => {
  const f = await fixture();
  f.home.reconstruction.buildingModel.walls[0].openings.push({
    id: { privateMetadata: 'synthetic-do-not-copy' },
    kind: 'door',
    offsetFeet: 12,
    widthFeet: 3,
    heightFeet: 7,
    sillFeet: 0
  });
  const a = await f.patch.prepare(modelPatchDraft(), f.context, f.request);
  await expect(
    f.patch.preview(
      { actionId: a.actionId, conversationId: a.conversationId, digest: a.digest },
      f.request
    )
  ).rejects.toThrow(/identity/);
});
test('solid walls with omitted or null optional openings still have an exact dimension preview', async () => {
  for (const omitted of [true, false]) {
    const f = await fixture(),
      wall = f.home.reconstruction.buildingModel.walls[1];
    if (omitted) delete wall.openings;
    else wall.openings = null;
    const a = await f.patch.prepare(
      {
        ...modelPatchDraft(),
        edits: [
          {
            target: 'wall',
            wallId: 'fixed-wall',
            openingId: '',
            field: 'thicknessFeet',
            expected: 0.5,
            value: 0.6
          }
        ]
      },
      f.context,
      f.request
    );
    const p = await f.patch.preview(
      { actionId: a.actionId, conversationId: a.conversationId, digest: a.digest },
      f.request
    );
    expect(p.walls[0].before.openings).toEqual([]);
    expect(p.walls[0].after.thicknessFeet).toBe(0.6);
  }
});
