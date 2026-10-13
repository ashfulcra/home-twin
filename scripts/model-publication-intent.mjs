import { createHash } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import {
  buildModelPatchCandidate,
  inverseModelPatch,
  validateModelPatch
} from '../src/lib/home/model-patch.js';
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
const exact = (/** @type {any} */ x, /** @type {string[]} */ ks) =>
  x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.keys(x).length === ks.length &&
  Object.keys(x).every((k) => ks.includes(k));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
  hex = /^[a-f0-9]{64}$/;
/** Data-only candidate intent. This is not publication authority: the native executor must
 * load the private immutable approval and recheck sources/current owner under the maintainer lock.
 * No cloud IO, lock, journal mutation or rollback execution. @param {any} access @param {any} review */
export function buildModelPublicationIntent(access, review) {
  const scope = validateChatScope(access?.scope),
    p = review?.proposal,
    a = review?.approval,
    d = a?.decision;
  const binding = {
    homeId: scope.homeId,
    principalId: scope.principalId,
    ownerUserId: scope.ownerUserId,
    root: scope.root
  };
  if (
    scope.role !== 'maintainer' ||
    scope.principalId !== scope.ownerUserId ||
    access.home?.id !== scope.homeId ||
    access.home.ownerUserId !== scope.ownerUserId ||
    !Number.isSafeInteger(access.home.revision) ||
    access.home.revision < 1 ||
    !p ||
    hash(p) !== review.digest ||
    canonicalJSON(p.binding) !== canonicalJSON(binding) ||
    !uuid.test(p.actionId) ||
    !uuid.test(p.conversationId) ||
    !uuid.test(p.turnId)
  )
    throw Error('Exact current owner model review required');
  if (
    !exact(a, ['schema', 'decision', 'digest']) ||
    a.schema !== 1 ||
    !exact(d, ['kind', 'binding', 'actionId', 'conversationId', 'proposalDigest', 'decidedAt']) ||
    d.kind !== 'model-approval' ||
    hash(d) !== a.digest ||
    d.proposalDigest !== review.digest ||
    canonicalJSON(d.binding) !== canonicalJSON(binding) ||
    d.actionId !== p.actionId ||
    d.conversationId !== p.conversationId ||
    typeof d.decidedAt !== 'string' ||
    d.decidedAt.length > 100 ||
    !Number.isFinite(Date.parse(d.decidedAt))
  )
    throw Error('Immutable owner decision required');
  if (
    !exact(p.baseline, ['revision', 'fileVersion', 'homeDigest', 'modelDigest']) ||
    p.baseline.revision !== access.home.revision ||
    p.baseline.fileVersion !== access.fileVersion ||
    typeof access.fileVersion !== 'string' ||
    !access.fileVersion ||
    access.fileVersion.length > 500 ||
    p.baseline.homeDigest !== hash(access.home) ||
    p.baseline.modelDigest !== hash(access.home.reconstruction?.buildingModel)
  )
    throw Error('Reviewed model baseline changed');
  const patch = validateModelPatch(p.draft);
  if (
    !Array.isArray(p.sources) ||
    p.sources.length !== patch.sourceIds.length ||
    new Set(p.sources.map((/** @type {any} */ s) => s.id)).size !== p.sources.length ||
    p.sources.some(
      (/** @type {any} */ s) =>
        !exact(s, ['id', 'sha256']) || !patch.sourceIds.includes(s.id) || !hex.test(s.sha256)
    )
  )
    throw Error('Reviewed model source proof differs');
  const { candidate, changes } = buildModelPatchCandidate(access.home, patch);
  candidate.revision++;
  if (!Number.isSafeInteger(candidate.revision)) throw Error('Home revision limit reached');
  const targetDigest = hash(candidate),
    payload = {
      schema: 'home-twin-model-publication/1',
      ...binding,
      baselineVersion: access.fileVersion,
      baseDigest: hash(access.home),
      base: structuredClone(access.home),
      target: candidate,
      targetDigest,
      review: {
        actionId: p.actionId,
        conversationId: p.conversationId,
        proposalDigest: review.digest,
        decision: structuredClone(a),
        sources: structuredClone(p.sources),
        changes
      },
      inverse: inverseModelPatch(patch),
      rollbackBaseline: {
        revision: candidate.revision,
        homeDigest: targetDigest,
        modelDigest: hash(candidate.reconstruction.buildingModel)
      }
    };
  return { ...payload, intentId: hash(payload) };
}
