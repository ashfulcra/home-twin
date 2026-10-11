import { validateReconstruction } from './reconstruction.js';
/** @param {any} v */
const str = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : String(v ?? '').slice(0, n));
/** @param {any} v */
const basis = (v) =>
  typeof v === 'object' && v
    ? `${str(v.type).replaceAll('-', ' ')}${v.note ? ': ' + str(v.note) : ''}${v.sourceSheet ? ' · ' + str(v.sourceSheet) : ''}${v.sourcePage ? ' · page ' + v.sourcePage : ''}${v.assumptionIds?.length ? ' · estimates: ' + v.assumptionIds.join(', ') : ''}`
    : str(v);
/** @param {any} v */
const num = (v, max = 10000) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
/** @param {any} p */
const point = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => num(v));
/** @param {any} v */
const positive = (v, max = 100) => num(v, max) && v > 0;
/** @param {any} v @param {number} max @returns {any[]} */
function list(v, max) {
  if (!Array.isArray(v) || v.length > max) throw Error('Invalid building collection');
  return v;
}
/** @param {any} polygon */
function simplePolygon(polygon) {
  return validateReconstruction({
    schemaVersion: 1,
    status: 'draft-needs-review',
    units: 'feet',
    source: { sha256: '0'.repeat(64) },
    levels: [{ id: 'polygon', elevationFeet: 0 }],
    rooms: [
      {
        id: 'polygon',
        name: 'Polygon',
        level: 'polygon',
        polygon,
        sourcePage: 1,
        sourceSheet: 'validation-only',
        heightFeet: 1
      }
    ]
  }).rooms[0].polygon;
}
/** @param {number[]} p @param {number[][]} polygon */
function inside(p, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
/** @param {number[]} a @param {number[]} b @param {number[]} c */
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** @param {number[]} a @param {number[]} b @param {number[]} p */
const onSegment = (a, b, p) =>
  Math.abs(cross(a, b, p)) < 1e-9 &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);
/** @param {number[][]} a @param {number[][]} b */
function ringsMeet(a, b) {
  return a.some((p, i) =>
    b.some((q, j) => {
      const p2 = a[(i + 1) % a.length],
        q2 = b[(j + 1) % b.length];
      return (
        (cross(p, p2, q) * cross(p, p2, q2) < 0 && cross(q, q2, p) * cross(q, q2, p2) < 0) ||
        onSegment(p, p2, q) ||
        onSegment(p, p2, q2) ||
        onSegment(q, q2, p) ||
        onSegment(q, q2, p2)
      );
    })
  );
}
/** @param {any} holes @param {number[][]} polygon */
function polygonHoles(holes, polygon) {
  const rings = list(holes ?? [], 30).map(simplePolygon);
  for (let i = 0; i < rings.length; i++) {
    const h = rings[i];
    if (h.some((p) => !inside(p, polygon)) || ringsMeet(h, polygon))
      throw Error('Void outside its floor');
    for (let j = 0; j < i; j++)
      if (ringsMeet(h, rings[j]) || inside(h[0], rings[j]) || inside(rings[j][0], h))
        throw Error('Intersecting floor voids');
  }
  return rings;
}
/** Portable representative architecture. Estimates remain explicit; this never changes home facts. @param {any} input */
export function validateBuilding(input) {
  if (!input || input.schemaVersion !== 1 || input.units !== 'feet')
    throw Error('Invalid representative building');
  const ids = new Set();
  const levels = list(input.levels, 20).map((l) => {
    if (
      !l ||
      typeof l.id !== 'string' ||
      !l.id ||
      ids.has(l.id) ||
      !num(l.elevationFeet) ||
      !positive(l.heightFeet)
    )
      throw Error('Invalid building level');
    ids.add(l.id);
    return { ...l, label: str(l.label || l.id), basis: basis(l.basis) };
  });
  if (!levels.length) throw Error('Missing levels');
  const rooms = validateReconstruction({
    schemaVersion: 1,
    status: 'draft-needs-review',
    units: 'feet',
    source: { sha256: '0'.repeat(64) },
    levels: levels.map((l) => ({ id: l.id, elevationFeet: l.elevationFeet })),
    rooms: list(input.rooms, 200).map((r) => ({
      ...r,
      sourcePage: r.sourcePage ?? 1,
      sourceSheet: r.sourceSheet ?? 'assumed',
      heightFeet: r.heightFeet ?? levels.find((l) => l.id === r.level)?.heightFeet
    }))
  }).rooms.map((r, i) => ({
    ...r,
    sourcePage: input.rooms[i].sourcePage ?? null,
    sourceSheet: input.rooms[i].sourceSheet ?? null,
    holes: polygonHoles(input.rooms[i].holes, r.polygon),
    basis: basis(input.rooms[i].basis)
  }));
  const wallIds = new Set();
  const walls = list(input.walls ?? [], 4000).map((w) => {
    if (
      !w ||
      !ids.has(w.level) ||
      !str(w.id) ||
      wallIds.has(w.id) ||
      !point(w.start) ||
      !point(w.end) ||
      !positive(w.heightFeet) ||
      !positive(w.thicknessFeet, 10) ||
      Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) < 0.01
    )
      throw Error('Invalid wall');
    wallIds.add(w.id);
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    let end = 0;
    const openingIds = new Set();
    const openings = list(w.openings ?? [], 50)
      .map((o) => {
        if (
          !o ||
          !str(o.id) ||
          openingIds.has(o.id) ||
          !['door', 'window', 'passage'].includes(o.kind) ||
          !num(o.offsetFeet) ||
          o.offsetFeet < 0 ||
          !positive(o.widthFeet) ||
          !num(o.sillFeet) ||
          o.sillFeet < 0 ||
          !positive(o.heightFeet) ||
          o.offsetFeet + o.widthFeet > len + 1e-6 ||
          o.sillFeet + o.heightFeet > w.heightFeet + 1e-6
        )
          throw Error('Invalid opening');
        openingIds.add(o.id);
        return { ...o, basis: basis(o.basis) };
      })
      .sort((a, b) => a.offsetFeet - b.offsetFeet);
    for (const o of openings) {
      if (o.offsetFeet < end - 1e-6) throw Error('Overlapping openings');
      end = o.offsetFeet + o.widthFeet;
    }
    return { ...w, basis: basis(w.basis), openings };
  });
  const features = list(input.features ?? [], 2000).map((f) => {
    if (
      !f ||
      !ids.has(f.level) ||
      !str(f.id) ||
      !point(f.position) ||
      !Array.isArray(f.size) ||
      f.size.length !== 3 ||
      !f.size.every(
        /** @param {any} v @param {number} i */ (v, i) =>
          i < 2 && f.polygon ? num(v, 200) && v >= 0 : positive(v, 200)
      ) ||
      (f.polygon &&
        (!Array.isArray(f.polygon) ||
          f.polygon.length < 3 ||
          f.polygon.length > 500 ||
          !f.polygon.every(point)))
    )
      throw Error('Invalid architectural feature');
    const metadata = typeof f.details === 'object' && f.details ? f.details : {};
    if (
      (metadata.shape !== undefined && typeof metadata.shape !== 'string') ||
      (metadata.clearanceFeet !== undefined && !positive(metadata.clearanceFeet))
    )
      throw Error('Invalid architectural dimensions');
    if (metadata.connectsLevels !== undefined) {
      const pair = metadata.connectsLevels;
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !ids.has(pair[0]) ||
        !ids.has(pair[1]) ||
        levels.find((l) => l.id === pair[0]).elevationFeet >=
          levels.find((l) => l.id === pair[1]).elevationFeet
      )
        throw Error('Invalid stair level connection');
    }
    return {
      ...f,
      polygon: f.polygon ? simplePolygon(f.polygon) : undefined,
      name: str(f.name),
      kind: str(f.kind),
      basis: basis(f.basis),
      detailsData: typeof f.details === 'object' && f.details ? f.details : {},
      details: str(
        typeof f.details === 'object' && f.details
          ? Object.entries(f.details)
              .map(
                ([k, v]) =>
                  `${k.replace(/([A-Z])/g, ' $1')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
              )
              .join(' · ')
          : f.details,
        4000
      )
    };
  });
  const roofs = list(input.roofs ?? [], 100).map((r) => {
    if (
      !r ||
      !ids.has(r.level) ||
      !num(r.elevationFeet) ||
      !positive(r.thicknessFeet, 10) ||
      !Array.isArray(r.polygon) ||
      r.polygon.length < 3 ||
      r.polygon.length > 500 ||
      !r.polygon.every(point)
    )
      throw Error('Invalid roof');
    return { ...r, polygon: simplePolygon(r.polygon), basis: basis(r.basis) };
  });
  const floorEnvelopes = list(input.floorEnvelopes ?? [], 30).map((f) => {
    if (!f || !ids.has(f.level) || !num(f.elevationFeet) || !positive(f.thicknessFeet, 10))
      throw Error('Invalid floor envelope');
    return {
      ...f,
      polygon: simplePolygon(f.polygon),
      holes: polygonHoles(f.holes, f.polygon),
      basis: basis(f.basis)
    };
  });
  const assumptions = list(input.assumptions ?? [], 1000).map((a) => ({
    id: str(a.id),
    subject: str(a.subject),
    value: str(typeof a.value === 'object' ? JSON.stringify(a.value) : a.value),
    reason: str(a.reason, 2000)
  }));
  return {
    schemaVersion: 1,
    units: 'feet',
    levels,
    rooms,
    walls,
    features,
    roofs,
    floorEnvelopes,
    assumptions,
    excludedFeatures: input.excludedFeatures ?? []
  };
}
/** Rectangular solids surrounding true wall apertures. @param {any} wall */
export function wallPanels(wall) {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const panels = [];
  let cursor = 0;
  for (const o of [...(wall.openings ?? [])].sort((a, b) => a.offsetFeet - b.offsetFeet)) {
    if (o.offsetFeet > cursor)
      panels.push({ x: cursor, y: 0, width: o.offsetFeet - cursor, height: wall.heightFeet });
    if (o.sillFeet > 0)
      panels.push({ x: o.offsetFeet, y: 0, width: o.widthFeet, height: o.sillFeet });
    const top = o.sillFeet + o.heightFeet;
    if (top < wall.heightFeet)
      panels.push({ x: o.offsetFeet, y: top, width: o.widthFeet, height: wall.heightFeet - top });
    cursor = o.offsetFeet + o.widthFeet;
  }
  if (cursor < length)
    panels.push({ x: cursor, y: 0, width: length - cursor, height: wall.heightFeet });
  return panels;
}
