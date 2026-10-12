import { createHash } from 'node:crypto';
export const assemblyDigest = (/** @type {Uint8Array} */ b) =>
  createHash('sha256').update(b).digest('hex');
const coordinateSystem = 'X=east Y=up Z=north; absolute Revit Z elevations';
const hex = /^[a-f0-9]{64}$/;
const id = (/** @type {any} */ v) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(v);
const finite = (/** @type {any} */ v) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000;
function text(/** @type {any} */ v, /** @type {number} */ max = 150) {
  if (typeof v !== 'string' || !v || v.length > max) throw Error('Invalid source text');
  return v;
}
/** @returns {any[]} */
function list(/** @type {any} */ v, /** @type {number} */ max) {
  if (!Array.isArray(v) || v.length > max)
    throw Error('Source collection exceeds limit or is missing');
  return v;
}
function raw(/** @type {any} */ b, /** @type {number} */ max) {
  if (!(b instanceof Uint8Array) || !b.length || b.length > max)
    throw Error('Source byte limit exceeded');
  return new TextDecoder('utf-8', { fatal: true }).decode(b);
}
function json(/** @type {any} */ b) {
  const v = JSON.parse(raw(b, 3 * 1024 * 1024));
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid source JSON');
  return v;
}
function point(/** @type {any} */ p) {
  if (!Array.isArray(p) || p.length !== 2 || !p.every(finite)) throw Error('Invalid source point');
  return [...p];
}
function polygon(/** @type {any} */ p) {
  const ring = list(p, 500).map(point);
  if (ring.length < 3 || new Set(ring.map((p) => p.join(','))).size < 3)
    throw Error('Invalid source polygon');
  return ring;
}
function number(/** @type {any} */ n) {
  if (!finite(n)) throw Error('Invalid source dimension');
  return n;
}
function positive(/** @type {any} */ n) {
  if (!finite(n) || n <= 0) throw Error('Invalid positive source dimension');
  return n;
}
function refs(/** @type {any} */ v) {
  return list(v ?? [], 300).map((x) => text(x, 200));
}
const provisional = (/** @type {any} */ v) => (typeof v === 'boolean' ? v : null);
function overrideMap(/** @type {any} */ v, /** @type {string} */ field) {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Invalid source vertical override map');
  for (const row of Object.values(v)) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !finite(row[field]))
      throw Error('Invalid source vertical override');
  }
  return v;
}
const combinedProvisional = (/** @type {any} */ a, /** @type {any} */ b) =>
  a === true || b === true ? true : a === false && b === false ? false : null;
function obj(/** @type {Uint8Array} */ bytes) {
  const lines = raw(bytes, 16 * 1024 * 1024).split('\n');
  if (lines.length > 1000000) throw Error('Mesh line limit exceeded');
  let vertices = 0,
    faces = 0;
  for (const line of lines) {
    const s = line.trim().split(/\s+/);
    if (s[0] === 'v') {
      if (s.length !== 4 || s.slice(1).some((v) => !finite(Number(v))))
        throw Error('Invalid mesh vertex');
      vertices++;
    } else if (s[0] === 'f') {
      if (s.length < 4 || s.length > 21) throw Error('Invalid mesh face');
      for (const token of s.slice(1)) {
        const parts = token.split('/');
        if (
          parts.length > 3 ||
          !/^[-]?[1-9]\d*$/.test(parts[0]) ||
          Math.abs(Number(parts[0])) > vertices ||
          parts.slice(1).some((v) => v && !/^[-]?[1-9]\d*$/.test(v))
        )
          throw Error('Invalid mesh face reference');
      }
      faces++;
    }
  }
  if (!vertices || !faces) throw Error('Mesh geometry missing');
  return { vertices, faces };
}
/** Deterministic read-only source package. No fitting, registration or viewer transform.
 * @param {{assemblyBytes:Uint8Array,models:Record<string,Uint8Array>,meshBytes:Uint8Array}} input
 * @param {{homeId:string,canonicalFileVersion:string,canonicalDigest:string}} binding */
export function importAssembly(input, binding) {
  if (
    !binding ||
    typeof binding.homeId !== 'string' ||
    typeof binding.canonicalDigest !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(binding.homeId) ||
    !hex.test(binding.canonicalDigest) ||
    typeof binding.canonicalFileVersion !== 'string' ||
    !binding.canonicalFileVersion ||
    binding.canonicalFileVersion.length > 300
  )
    throw Error('Explicit home baseline binding required');
  const a = json(input.assemblyBytes);
  if (
    a.schema_version !== 1 ||
    a.units !== 'feet' ||
    a.coordinate_system !== coordinateSystem ||
    !a.validation ||
    !Array.isArray(a.validation.errors) ||
    a.validation.errors.length ||
    a.validation.baseline_unchanged !== true
  )
    throw Error('Validated feet/east-up-north source assembly required');
  if (!hex.test(a.obj_sha256) || assemblyDigest(input.meshBytes) !== a.obj_sha256)
    throw Error('Source mesh digest differs');
  const meshCounts = obj(input.meshBytes);
  if (!a.levels || typeof a.levels !== 'object' || Array.isArray(a.levels) || !a.baseline?.models)
    throw Error('Source level/manifest bindings missing');
  const keys = Object.keys(a.levels);
  if (
    !keys.length ||
    keys.length > 20 ||
    Object.keys(a.baseline.models).sort().join('|') !== [...keys].sort().join('|') ||
    Object.keys(input.models).sort().join('|') !== [...keys].sort().join('|')
  )
    throw Error('Source level/model set differs');
  /** @type {any[]} */ const levels = [];
  /** @type {any[]} */ const rooms = [];
  /** @type {any[]} */ const walls = [];
  /** @type {any[]} */ const receipts = [
    { id: 'assembly', sha256: assemblyDigest(input.assemblyBytes) }
  ];
  let openingCount = 0;
  for (const level of keys) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(level)) throw Error('Invalid source level ID');
    const datum = a.levels[level],
      bytes = input.models[level],
      receipt = a.baseline.models[level];
    if (!hex.test(receipt?.sha256) || assemblyDigest(bytes) !== receipt.sha256)
      throw Error('Source floor model digest differs');
    const m = json(bytes);
    if (m.units !== 'feet') throw Error('Source floor units differ');
    receipts.push({ id: level, sha256: receipt.sha256 });
    const elevation = number(datum.floor_elevation_ft),
      ceiling = number(datum.ceiling_elevation_ft);
    if (ceiling <= elevation) throw Error('Source ceiling/floor datums differ');
    levels.push({
      id: level,
      label: level.replaceAll('-', ' ').replaceAll('_', ' '),
      elevationFeet: elevation,
      ceilingElevationFeet: ceiling,
      provisional: provisional(datum.provisional),
      source: text(datum.source ?? 'Source assembly datum', 1000)
    });
    const qualify = (/** @type {any} */ native) => {
      if (!id(native)) throw Error('Invalid source entity ID');
      return level + ':' + native;
    };
    const wallIDs = new Set();
    const roomIDs = new Set();
    const openingIDs = new Set();
    const floorOverrides = overrideMap(datum.room_floor_elevations, 'floor_elevation_ft'),
      ceilingOverrides = overrideMap(datum.room_ceiling_elevations, 'ceiling_elevation_ft');
    for (const w of list(m.walls, 4000)) {
      if (wallIDs.has(w.id)) throw Error('Duplicate source wall');
      wallIDs.add(w.id);
      const start = point(w.start),
        end = point(w.end);
      if (start[0] === end[0] && start[1] === end[1]) throw Error('Zero source wall');
      walls.push({
        id: qualify(w.id),
        nativeId: w.id,
        level,
        start,
        end,
        thicknessFeet: positive(w.thickness_ft),
        heightFeet: positive(w.height_ft),
        kind: text(w.kind ?? 'wall', 100),
        roomIds: refs(w.adjoins).map(qualify),
        evidenceIds: refs(w.evidence_ids),
        provisional: provisional(w.provisional),
        openings: /** @type {any[]} */ ([])
      });
    }
    for (const o of list(m.openings, 2000)) {
      if (openingIDs.has(o.id) || !wallIDs.has(o.host_wall))
        throw Error('Duplicate opening or missing source host');
      openingIDs.add(o.id);
      const sill = number(o.sill_ft),
        head = number(o.head_ft);
      if (head <= sill) throw Error('Source opening head below sill');
      const host = walls.find((w) => w.level === level && w.nativeId === o.host_wall);
      if (!host) throw Error('Source opening host missing');
      host.openings.push({
        id: qualify(o.id),
        nativeId: o.id,
        kind: text(o.kind, 100),
        offsetFeet: number(o.offset_ft),
        widthFeet: positive(o.width_ft),
        sillFeet: sill,
        headFeet: head,
        evidenceIds: refs(o.evidence_ids),
        provisional: provisional(o.provisional)
      });
      openingCount++;
    }
    for (const r of list(m.rooms, 200)) {
      if (roomIDs.has(r.id)) throw Error('Duplicate source room');
      roomIDs.add(r.id);
      const wallIds = refs(r.wall_ids);
      if (wallIds.some((x) => !wallIDs.has(x))) throw Error('Source room wall reference missing');
      const rf = Object.hasOwn(floorOverrides, r.id) ? floorOverrides[r.id] : undefined,
        rc = Object.hasOwn(ceilingOverrides, r.id) ? ceilingOverrides[r.id] : undefined;
      const floor = rf ? number(rf.floor_elevation_ft) : elevation,
        top = rc ? number(rc.ceiling_elevation_ft) : ceiling;
      if (top <= floor) throw Error('Effective source ceiling below floor');
      const fp = rf ? provisional(rf.provisional) : provisional(datum.provisional),
        cp = rc
          ? provisional(rc.provisional)
          : provisional(datum.ceiling_provisional ?? datum.provisional);
      rooms.push({
        id: qualify(r.id),
        nativeId: r.id,
        name: text(r.name),
        level,
        polygon: polygon(r.footprint),
        wallIds: wallIds.map(qualify),
        evidenceIds: refs(r.evidence_ids),
        provisional: provisional(r.provisional),
        floorElevationFeet: floor,
        ceilingElevationFeet: top,
        floorProvisional: fp,
        ceilingProvisional: cp,
        verticalProvisional: combinedProvisional(fp, cp),
        kind: typeof r.kind === 'string' ? text(r.kind, 100) : null
      });
    }
  }
  if (rooms.length > 200 || walls.length > 4000 || openingCount > 2000)
    throw Error('Total source geometry limit exceeded');
  const parts = Object.entries(a.elements ?? {});
  if (parts.length > 2000) throw Error('Source mesh part limit exceeded');
  return {
    schema: 'home-twin-assembly-preview/1',
    status: 'source-preview-needs-review',
    homeBinding: { ...binding },
    units: 'feet',
    coordinateSystem,
    levels,
    rooms,
    walls,
    sceneParts: parts.map(([name, p]) => ({
      name: text(name, 300),
      kind: text(p.kind, 100),
      level: typeof p.level === 'string' ? p.level : null,
      provisional: provisional(p.provisional)
    })),
    mesh: { sha256: a.obj_sha256, filename: a.obj_sha256 + '.obj', ...meshCounts },
    sourceReceipts: [...receipts, { id: 'mesh', sha256: a.obj_sha256 }],
    uncertainties: list(a.uncertainties ?? [], 300).map((v) => text(v, 2000)),
    limitations: [
      'Read-only imported source preview; accepted home facts are unchanged.',
      'Plan metadata preserves native geometry. Sloped roofs, ceilings, floor holes and stair profiles remain in the original mesh and archived source assembly.',
      'Vertical datums retain source provisional status; no surveyed accuracy is inferred.',
      'The source viewer matrix is deliberately not applied to canonical data. Apply the north-axis reflection once only at rendering.'
    ]
  };
}
