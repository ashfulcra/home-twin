import { buildModelPublicationIntent } from '../../../scripts/model-publication-intent.mjs';
import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../home/canonical-json.js';
import { modelPatchHome, modelPatchDraft } from '../test-fixtures/model-patch.js';
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
async function fixture() {
  const owner = '33333333-3333-4333-8333-333333333333',
    home = modelPatchHome();
  home.ownerUserId = owner;
  const scope = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin',
    role: 'maintainer'
  };
  const binding = {
    homeId: 'example',
    principalId: owner,
    ownerUserId: owner,
    root: '/Example/twin'
  };
  const proposal = {
    binding,
    actionId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    turnId: '44444444-4444-4444-8444-444444444444',
    draft: modelPatchDraft(),
    baseline: {
      revision: 7,
      fileVersion: 'v7',
      homeDigest: hash(home),
      modelDigest: hash(home.reconstruction.buildingModel)
    },
    sources: [{ id: 'manual', sha256: 'a'.repeat(64) }],
    recordedAt: '2026-01-01T00:00:00Z'
  };
  const digest = hash(proposal),
    decision = {
      kind: 'model-approval',
      binding,
      actionId: proposal.actionId,
      conversationId: proposal.conversationId,
      proposalDigest: digest,
      decidedAt: '2026-01-01T00:01:00Z'
    };
  return {
    build: buildModelPublicationIntent,
    access: { scope, home, fileVersion: 'v7', token: 'synthetic-secret-token' },
    review: { proposal, digest, approval: { schema: 1, decision, digest: hash(decision) } }
  };
}
test('approved bounded intent preserves all untouched raw data and binds the inverse to the exact target', async () => {
  const f = await fixture(),
    raw = JSON.stringify(f.access.home),
    p = f.build(f.access, f.review);
  expect(p.target.revision).toBe(8);
  expect(p.target.reconstruction.buildingModel.walls[0].openings[0].widthFeet).toBe(3.5);
  expect(p.target.contacts).toEqual(f.access.home.contacts);
  expect(p.target.reconstruction.userOverrides).toEqual(f.access.home.reconstruction.userOverrides);
  expect(p.target.reconstruction.buildingModel.floorEnvelopes).toEqual(
    f.access.home.reconstruction.buildingModel.floorEnvelopes
  );
  expect(p.target.reconstruction.buildingModel.walls[1]).toEqual(
    f.access.home.reconstruction.buildingModel.walls[1]
  );
  expect(p.inverse.edits[0].expected).toBe(3.5);
  expect(p.inverse.edits[0].value).toBe(3);
  expect(p.rollbackBaseline.homeDigest).toBe(hash(p.target));
  expect(p.rollbackBaseline.revision).toBe(8);
  expect(JSON.stringify(f.access.home)).toBe(raw);
  expect(JSON.stringify(p)).not.toContain('synthetic-secret-token');
  expect(f.build(f.access, f.review)).toEqual(p);
});
test('unsigned or forged approval and different actor/root never produce a publication intent', async () => {
  const f = await fixture();
  for (const mutate of [
    (/** @type {any} */ r) => delete r.approval,
    (/** @type {any} */ r) => (r.approval.decision.proposalDigest = 'b'.repeat(64)),
    (/** @type {any} */ r) => (r.proposal.draft.edits[0].value = 9)
  ]) {
    const r = structuredClone(f.review);
    mutate(r);
    expect(() => f.build(f.access, r)).toThrow();
  }
  for (const change of [
    { role: 'contributor' },
    { principalId: '55555555-5555-4555-8555-555555555555' },
    { root: '/Different/twin' }
  ])
    expect(() =>
      f.build({ ...f.access, scope: { ...f.access.scope, ...change } }, f.review)
    ).toThrow();
});
test('any current home or file version drift prevents even intent creation', async () => {
  const f = await fixture();
  for (const mutate of [
    (/** @type {any} */ a) => (a.fileVersion = 'v8'),
    (/** @type {any} */ a) => a.home.contacts.push({ id: 'new' }),
    (/** @type {any} */ a) => a.home.revision++
  ]) {
    const a = structuredClone(f.access);
    mutate(a);
    expect(() => f.build(a, f.review)).toThrow();
  }
});
