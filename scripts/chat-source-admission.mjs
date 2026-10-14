import { createHash } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { validAttachment } from '../src/lib/home/attachments.js';
const exact = (/** @type {any} */ x, /** @type {string[]} */ keys) =>
  x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((k) => keys.includes(k));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
/** Server-only evidence draft. This never extends the model's record-tool schema. */
export function validateSourceAdmissionDraft(
  /** @type {any} */ input,
  /** @type {string} */ actionId
) {
  if (
    !uuid.test(actionId) ||
    !exact(input, ['kind', 'value', 'attachment', 'sourceIds']) ||
    input.kind !== 'evidence' ||
    typeof input.value !== 'string' ||
    !input.value.trim() ||
    input.value.length > 500 ||
    !exact(input.attachment, ['sha256', 'sizeBytes', 'mimeType', 'extension', 'originalName']) ||
    !validAttachment(input.attachment) ||
    !Array.isArray(input.sourceIds) ||
    input.sourceIds.length !== 1 ||
    input.sourceIds[0] !== 'evidence-' + actionId
  )
    throw Error('Exact uploaded source evidence required');
  return structuredClone(input);
}
/** Data-only review from a confirmed own-upload receipt. No decision, journal or cloud effects.
 * A separate exact persisted owner decision is required by the source-only native adapter. */
export function buildSourceAdmissionReview(/** @type {any} */ original, /** @type {any} */ access) {
  const scope = validateChatScope(access?.scope),
    record = original?.record,
    source = original?.source;
  if (
    scope.role !== 'maintainer' ||
    scope.principalId !== scope.ownerUserId ||
    access.home?.ownerUserId !== scope.ownerUserId ||
    access.home.id !== scope.homeId ||
    !Number.isSafeInteger(access.home.revision) ||
    access.home.revision < 1 ||
    typeof access.fileVersion !== 'string' ||
    !access.fileVersion ||
    access.fileVersion.length > 500 ||
    !exact(record, ['id', 'homeId', 'kind', 'value', 'attachment', 'authorUserId', 'recordedAt']) ||
    record.homeId !== scope.homeId ||
    record.authorUserId !== scope.principalId ||
    typeof record.recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.recordedAt)) ||
    Date.parse(record.recordedAt) > Date.now() ||
    !exact(source, ['id', 'title', 'attachment', 'sourceUserId', 'contributionId']) ||
    source.sourceUserId !== scope.principalId ||
    source.contributionId !== record.id ||
    source.id !== 'evidence-' + record.id ||
    source.title !== record.value ||
    canonicalJSON(source.attachment) !== canonicalJSON(record.attachment)
  )
    throw Error('Confirmed current-owner upload required');
  const draft = validateSourceAdmissionDraft(
    {
      kind: record.kind,
      value: record.value,
      attachment: record.attachment,
      sourceIds: [source.id]
    },
    record.id
  );
  if (
    !(original.bytes instanceof Uint8Array) ||
    original.bytes.byteLength !== record.attachment.sizeBytes ||
    createHash('sha256').update(original.bytes).digest('hex') !== record.attachment.sha256
  )
    throw Error('Original bytes differ');
  const proposal = {
    kind: 'source-admission',
    binding: {
      homeId: scope.homeId,
      principalId: scope.principalId,
      ownerUserId: scope.ownerUserId,
      root: scope.root
    },
    actionId: record.id,
    draft,
    baseline: {
      revision: access.home.revision,
      fileVersion: access.fileVersion,
      homeDigest: hash(access.home)
    },
    sources: [{ id: source.id, sha256: record.attachment.sha256 }],
    recordedAt: record.recordedAt
  };
  return { record: structuredClone(record), proposal, digest: hash(proposal) };
}
