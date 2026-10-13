import { validateBuilding } from './representative-building.js';
import { validNoteSources } from './contributions.js';
const identity = /^[a-z0-9][a-z0-9._-]{0,199}$/i;
/** @param {any} value @param {string[]} keys */
function exact(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((k) => keys.includes(k))
  );
}
/** Data only. No coordinates, transforms, identity replacement or authority fields. @param {any} input */
export function validateModelPatch(input) {
  if (
    !exact(input, ['kind', 'note', 'sourceIds', 'edits']) ||
    input.kind !== 'model-patch' ||
    typeof input.note !== 'string' ||
    !input.note.trim() ||
    input.note.length > 1800 ||
    !validNoteSources(input.sourceIds) ||
    input.sourceIds.length > 6 ||
    !Array.isArray(input.edits) ||
    input.edits.length < 1 ||
    input.edits.length > 8
  )
    throw Error('Use a bounded model patch with an explanation and home source references');
  const touched = new Set();
  const edits = input.edits.map((/** @type {any} */ edit) => {
    const allowed =
      edit?.target === 'wall'
        ? ['heightFeet', 'thicknessFeet']
        : ['heightFeet', 'widthFeet', 'offsetFeet', 'sillFeet'];
    if (
      !exact(edit, ['target', 'wallId', 'openingId', 'field', 'expected', 'value']) ||
      !['wall', 'opening'].includes(edit.target) ||
      !identity.test(edit.wallId) ||
      (edit.target === 'wall' ? edit.openingId !== '' : !identity.test(edit.openingId)) ||
      !allowed.includes(edit.field) ||
      [edit.expected, edit.value].some(
        (n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 10000
      ) ||
      (['offsetFeet', 'sillFeet'].includes(edit.field) ? edit.value < 0 : edit.value <= 0) ||
      edit.value === edit.expected
    )
      throw Error('Unsupported or unchanged model edit');
    const key = edit.target + '/' + edit.wallId + '/' + edit.openingId + '/' + edit.field;
    if (touched.has(key)) throw Error('A model field may be edited only once per patch');
    touched.add(key);
    return {
      target: edit.target,
      wallId: edit.wallId,
      openingId: edit.openingId,
      field: edit.field,
      expected: edit.expected,
      value: edit.value
    };
  });
  return { kind: 'model-patch', note: input.note.trim(), sourceIds: [...input.sourceIds], edits };
}
/** Compute a local candidate only. Validation output is never substituted for raw saved metadata.
 * @param {any} home @param {any} input */
export function buildModelPatchCandidate(home, input) {
  const patch = validateModelPatch(input),
    model = home?.reconstruction?.buildingModel;
  if (
    !home ||
    typeof home !== 'object' ||
    !model ||
    new TextEncoder().encode(JSON.stringify(home)).byteLength > 2 * 1024 * 1024
  )
    throw Error('Bounded saved home model required');
  validateBuilding(model);
  const candidate = structuredClone(home),
    targetModel = candidate.reconstruction.buildingModel;
  const touchedLevels = new Set();
  const changes = patch.edits.map((/** @type {any} */ edit) => {
    const wall = model.walls.find((/** @type {any} */ w) => w.id === edit.wallId);
    const target =
      edit.target === 'wall'
        ? wall
        : wall?.openings?.find((/** @type {any} */ o) => o.id === edit.openingId);
    if (!target || target[edit.field] !== edit.expected)
      throw Error('Expected model field changed or target is unavailable');
    touchedLevels.add(wall.level);
    if (touchedLevels.size > 1) throw Error('A bounded model correction must affect one level');
    const nextWall = targetModel.walls.find((/** @type {any} */ w) => w.id === edit.wallId);
    const next =
      edit.target === 'wall'
        ? nextWall
        : nextWall.openings.find((/** @type {any} */ o) => o.id === edit.openingId);
    if (
      edit.target === 'wall' &&
      edit.field === 'heightFeet' &&
      Math.max(edit.expected, edit.value) >
        model.levels.find((/** @type {any} */ l) => l.id === wall.level).heightFeet
    )
      throw Error('Wall height exceeds its existing level; use separate geometry review');
    if (
      edit.target === 'opening' &&
      edit.field === 'sillFeet' &&
      next.kind !== 'window' &&
      (edit.expected !== 0 || edit.value !== 0)
    )
      throw Error('Door and passage openings must remain at their floor');
    next[edit.field] = edit.value;
    return {
      target: edit.target,
      wallId: edit.wallId,
      openingId: edit.openingId,
      field: edit.field,
      before: edit.expected,
      after: edit.value,
      units: 'feet'
    };
  });
  validateBuilding(targetModel);
  return { candidate, changes, majorReviewRequired: true };
}
/** Inversion is data only; the publisher must also bind the exact current target model/version.
 * @param {any} input */
export function inverseModelPatch(input) {
  const patch = validateModelPatch(input);
  return validateModelPatch({
    ...patch,
    edits: patch.edits.map((/** @type {any} */ edit) => ({
      ...edit,
      expected: edit.value,
      value: edit.expected
    }))
  });
}
