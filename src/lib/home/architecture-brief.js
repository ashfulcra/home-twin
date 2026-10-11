import { validateBuilding } from './representative-building.js';

/** @param {any} value */
function scalar(value) {
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return value;
  return null;
}
/** Explicit primitives only: no arbitrary nested metadata or stringified objects. @param {any} value */
function field(value) {
  return Array.isArray(value)
    ? value
        .slice(0, 100)
        .map(scalar)
        .filter((v) => v !== null)
    : scalar(value);
}
/** @param {any} entity @param {string[]} keys */
const pick = (entity, keys) => Object.fromEntries(keys.map((k) => [k, field(entity?.[k])]));
/** @param {any} value */
function basis(value) {
  if (typeof value === 'string') return { note: scalar(value) };
  const out = pick(value, ['type', 'note', 'sourceSheet']);
  return {
    ...out,
    sourcePage: page(value?.sourcePage),
    assumptionIds: Array.isArray(value?.assumptionIds)
      ? value.assumptionIds
          .filter(/** @param {any} v */ (v) => typeof v === 'string')
          .slice(0, 100)
          .map(/** @param {string} v */ (v) => v.slice(0, 500))
      : []
  };
}
/** @param {any} value */
const page = (value) => (Number.isInteger(value) && value > 0 ? value : null);
/** @param {any} value */
const reference = (value) => ({
  sourcePage: page(value?.sourcePage),
  sourceSheet: typeof value?.sourceSheet === 'string' ? scalar(value.sourceSheet) : null,
  basis: basis(value?.basis)
});
/** A private agent projection of representative architecture, never installed-system facts. @param {any} input @returns {any} */
export function buildArchitectureBrief(input) {
  if (input === undefined || input === null) return { status: 'not-recorded' };
  let valid;
  try {
    valid = validateBuilding(input);
  } catch {
    return {
      status: 'invalid',
      reason: 'Saved architectural model needs validation; other home records remain available.'
    };
  }
  const counts = {
    levels: valid.levels.length,
    rooms: valid.rooms.length,
    walls: valid.walls.length,
    features: valid.features.length,
    roofs: valid.roofs.length,
    floors: valid.floorEnvelopes.length
  };
  const details = [
    'sourceEvidence',
    'sourceSpecification',
    'manufacturerSpecification',
    'sourceConflict',
    'finish',
    'installedFinish',
    'form',
    'shape',
    'type',
    'placement',
    'product',
    'equipment',
    'openToSky',
    'clearanceFeet',
    'connectsLevels',
    'representativeCofferGrid',
    'riserCount',
    'riserCountStatus'
  ];
  const supplement = (/** @type {any} */ value) =>
    Array.isArray(value)
      ? value.slice(0, 100).filter((v) => v && typeof v === 'object' && !Array.isArray(v))
      : [];
  const out = {
    schema: 'home-twin-architecture-brief/1',
    status: 'available',
    units: 'feet',
    scope:
      'Representative visualization from the current snapshot. Source specifications and estimates do not establish installed products, verified as-built measurements or service history.',
    counts,
    coordinateFrame: pick(input.coordinateFrame, ['x', 'y', 'z', 'datum', 'north']),
    levels: valid.levels.map((l, i) => ({
      ...pick(l, ['id', 'label', 'elevationFeet', 'heightFeet']),
      basis: basis(input.levels[i].basis)
    })),
    rooms: valid.rooms.map((r, i) => ({
      ...pick(r, ['id', 'name', 'level', 'heightFeet']),
      geometryRole:
        typeof input.rooms[i].geometryRole === 'string'
          ? scalar(input.rooms[i].geometryRole)
          : null,
      polygon: r.polygon,
      holes: r.holes,
      ...reference(input.rooms[i])
    })),
    walls: valid.walls.map((w, i) => {
      const raw = input.walls[i];
      const openings = new Map((raw.openings ?? []).map((/** @type {any} */ o) => [o.id, o]));
      return {
        ...pick(w, ['id', 'roomId', 'level', 'start', 'end', 'heightFeet', 'thicknessFeet']),
        basis: basis(raw.basis),
        openings: w.openings.map((/** @type {any} */ o) => ({
          ...pick(o, ['id', 'kind', 'offsetFeet', 'widthFeet', 'sillFeet', 'heightFeet']),
          ...reference(openings.get(o.id))
        }))
      };
    }),
    features: valid.features.map((f, i) => ({
      ...pick(f, ['id', 'roomId', 'name', 'kind', 'level', 'position', 'size']),
      polygon: f.polygon ?? null,
      ...reference(input.features[i]),
      details: pick(input.features[i].details, details)
    })),
    roofs: valid.roofs.map((r, i) => ({
      ...pick(r, ['id', 'level', 'elevationFeet', 'thicknessFeet']),
      polygon: r.polygon,
      ...reference(input.roofs[i])
    })),
    floorEnvelopes: valid.floorEnvelopes.map((f, i) => ({
      ...pick(f, ['id', 'level', 'elevationFeet', 'thicknessFeet']),
      polygon: f.polygon,
      holes: f.holes,
      ...reference(input.floorEnvelopes[i])
    })),
    assumptions: (input.assumptions ?? []).map((/** @type {any} */ a) =>
      pick(a, ['id', 'subject', 'value', 'reason'])
    ),
    excludedFeatures: supplement(input.excludedFeatures).map((/** @type {any} */ e) => ({
      ...pick(e, ['id', 'reason']),
      sourcePages: Array.isArray(e.sourcePages)
        ? e.sourcePages
            .map(page)
            .filter((/** @type {any} */ v) => v !== null)
            .slice(0, 100)
        : []
    })),
    sourceSpecifications: supplement(input.sourceSpecifications).map((/** @type {any} */ s) => ({
      ...pick(s, ['subject', 'specification', 'installedStatus']),
      sourcePage: page(s.sourcePage),
      sourceSheet: typeof s.sourceSheet === 'string' ? scalar(s.sourceSheet) : null
    })),
    supplementalTruncated: [input.excludedFeatures, input.sourceSpecifications].some(
      (v) => Array.isArray(v) && v.length > 100
    )
  };
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > 2 * 1024 * 1024)
    return {
      status: 'size-limited',
      counts,
      reason:
        'Read the current private home.json for complete architectural context; this portable brief limits architecture to 2 MiB.'
    };
  return out;
}
