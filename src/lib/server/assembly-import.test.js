import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { importAssembly } from '../../../scripts/assembly-import.mjs';
const bytes = (/** @type {any} */ v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v));
const sha = (/** @type {any} */ v) => createHash('sha256').update(v).digest('hex');
/** @returns {any} */
function fixture() {
  const meshBytes = bytes('o lower__walls\nv 2 0 3\nv 8 0 3\nv 2 7 3\nf 1 2 3\n');
  const model = {
    units: 'feet',
    rooms: [
      {
        id: 'room',
        name: 'Known Room',
        footprint: [
          [2, 3],
          [8, 3],
          [8, 9],
          [2, 9]
        ],
        wall_ids: ['wall'],
        provisional: true,
        evidence_ids: ['capture']
      }
    ],
    walls: [
      {
        id: 'wall',
        start: [2, 3],
        end: [8, 3],
        thickness_ft: 0.5,
        height_ft: 7,
        kind: 'shared',
        adjoins: ['room']
      }
    ],
    openings: [
      {
        id: 'door',
        host_wall: 'wall',
        offset_ft: 1,
        width_ft: 2,
        sill_ft: 0,
        head_ft: 6,
        kind: 'door',
        provisional: true
      }
    ]
  };
  const models = {
    lower: bytes(model),
    upper: bytes({ ...model, rooms: [{ ...model.rooms[0], name: 'Upper Room' }] })
  };
  const assembly = {
    schema_version: 1,
    units: 'feet',
    coordinate_system: 'X=east Y=up Z=north; absolute Revit Z elevations',
    canonical_to_viewer: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    obj: 'scene.obj',
    obj_sha256: sha(meshBytes),
    baseline: {
      models: Object.fromEntries(
        Object.entries(models).map(([id, b]) => [id, { path: `models/${id}.json`, sha256: sha(b) }])
      )
    },
    levels: {
      lower: { floor_elevation_ft: 0, ceiling_elevation_ft: 7, provisional: true },
      upper: {
        floor_elevation_ft: 8.5,
        ceiling_elevation_ft: 16,
        provisional: true,
        room_floor_elevations: { room: { floor_elevation_ft: 9, provisional: true } },
        room_ceiling_elevations: { room: { ceiling_elevation_ft: 16.5, provisional: true } }
      }
    },
    elements: { lower__walls: { kind: 'wall', level: 'lower', provisional: true } },
    stairs: [],
    uncertainties: ['Roof geometry follows original mesh.'],
    validation: { errors: [], baseline_unchanged: true }
  };
  return { assemblyBytes: bytes(assembly), models, meshBytes };
}
/** @type {any} */
const binding = {
  homeId: 'example',
  canonicalFileVersion: 'version-1',
  canonicalDigest: 'a'.repeat(64)
};
test('preserves full bounded source uncertainty notes instead of treating them as IDs', () => {
  const f = fixture(),
    a = JSON.parse(f.assemblyBytes.toString());
  a.uncertainties = ['Provisional datum. '.repeat(40)];
  f.assemblyBytes = bytes(a);
  expect(importAssembly(f, binding).uncertainties).toEqual(a.uncertainties);
});
test('ceiling uncertainty and malformed or inverted room overrides cannot become verified heights', () => {
  const f = fixture(),
    a = JSON.parse(f.assemblyBytes.toString());
  a.levels.lower.provisional = false;
  a.levels.lower.room_ceiling_elevations = {
    room: { ceiling_elevation_ft: 7.5, provisional: true }
  };
  f.assemblyBytes = bytes(a);
  expect(importAssembly(f, binding).rooms[0]).toMatchObject({
    floorProvisional: false,
    ceilingProvisional: true,
    verticalProvisional: true,
    ceilingElevationFeet: 7.5
  });
  for (const bad of [false, null, 0, [], { floor_elevation_ft: 10, provisional: false }]) {
    const x = fixture(),
      source = JSON.parse(x.assemblyBytes.toString());
    source.levels.lower.room_floor_elevations = { room: bad };
    x.assemblyBytes = bytes(source);
    expect(() => importAssembly(x, binding)).toThrow();
  }
});
test('explicit baseline binding requires strings before regex validation', () => {
  for (const homeId of [undefined, 123, null])
    expect(() => importAssembly(fixture(), { ...binding, homeId })).toThrow();
  for (const canonicalDigest of [123n, undefined])
    expect(() => importAssembly(fixture(), { ...binding, canonicalDigest })).toThrow();
});
test('preserves original plan vertices and mesh digest without applying viewer transforms', () => {
  const input = fixture();
  const before = Object.fromEntries(Object.entries(input.models).map(([k, b]) => [k, sha(b)]));
  const p = importAssembly(input, binding);
  expect(p.schema).toBe('home-twin-assembly-preview/1');
  expect(p.status).toBe('source-preview-needs-review');
  expect(p.homeBinding).toEqual(binding);
  expect(p.rooms.map((r) => r.id)).toEqual(['lower:room', 'upper:room']);
  expect(p.rooms[0].polygon).toEqual([
    [2, 3],
    [8, 3],
    [8, 9],
    [2, 9]
  ]);
  expect(p.walls[0].start).toEqual([2, 3]);
  expect(p.walls[0].end).toEqual([8, 3]);
  expect(p.walls[0].openings[0]).toMatchObject({
    id: 'lower:door',
    offsetFeet: 1,
    widthFeet: 2,
    headFeet: 6
  });
  expect(p.mesh.sha256).toBe(sha(input.meshBytes));
  expect(p.rooms[1]).toMatchObject({
    name: 'Upper Room',
    floorElevationFeet: 9,
    ceilingElevationFeet: 16.5,
    provisional: true
  });
  expect(Object.fromEntries(Object.entries(input.models).map(([k, b]) => [k, sha(b)]))).toEqual(
    before
  );
});
test('source digest drift, missing models and invalid source validation never become a candidate', () => {
  for (const issue of ['model', 'mesh', 'missing', 'validation']) {
    const f = fixture();
    if (issue === 'model')
      f.models.lower = bytes({ ...JSON.parse(f.models.lower.toString()), rooms: [] });
    if (issue === 'mesh') f.meshBytes = bytes(f.meshBytes.toString().replace('v 2 0 3', 'v 3 0 3'));
    if (issue === 'missing') delete f.models.upper;
    if (issue === 'validation') {
      const a = JSON.parse(f.assemblyBytes.toString());
      a.validation.errors = ['broken'];
      f.assemblyBytes = bytes(a);
    }
    expect(() => importAssembly(f, binding)).toThrow();
  }
});
test('unknown units, orientation, home binding and malformed geometry hold', () => {
  for (const issue of ['units', 'orientation', 'scope', 'nonfinite', 'duplicate', 'host']) {
    const f = fixture();
    let b = binding;
    if (issue === 'scope') b = { ...binding, canonicalDigest: 'bad' };
    else if (['units', 'orientation'].includes(issue)) {
      const a = JSON.parse(f.assemblyBytes.toString());
      if (issue === 'units') a.units = 'meters';
      else a.coordinate_system = 'unknown';
      f.assemblyBytes = bytes(a);
    } else {
      const m = JSON.parse(f.models.lower.toString());
      if (issue === 'nonfinite') m.walls[0].start[0] = null;
      if (issue === 'duplicate') m.rooms.push(m.rooms[0]);
      if (issue === 'host') m.openings[0].host_wall = 'missing';
      f.models.lower = bytes(m);
      const a = JSON.parse(f.assemblyBytes.toString());
      a.baseline.models.lower.sha256 = sha(f.models.lower);
      f.assemblyBytes = bytes(a);
    }
    expect(() => importAssembly(f, b)).toThrow();
  }
});
test('bounded source JSON and original OBJ vertices reject oversized or invalid data', () => {
  for (const issue of ['json', 'mesh', 'vertex', 'face']) {
    const f = fixture();
    if (issue === 'json') f.assemblyBytes = Buffer.alloc(3 * 1024 * 1024 + 1);
    else {
      f.meshBytes =
        issue === 'mesh'
          ? Buffer.alloc(16 * 1024 * 1024 + 1)
          : bytes(issue === 'vertex' ? 'v NaN 0 0\nf 1 1 1\n' : 'v 0 0 0\nf 1 2 3\n');
      const a = JSON.parse(f.assemblyBytes.toString());
      a.obj_sha256 = sha(f.meshBytes);
      f.assemblyBytes = bytes(a);
    }
    expect(() => importAssembly(f, binding)).toThrow();
  }
});
