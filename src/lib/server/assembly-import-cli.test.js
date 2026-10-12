import { test, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
  readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sha = (/** @type {any} */ b) => createHash('sha256').update(b).digest('hex');
function setup() {
  const d = mkdtempSync(join(tmpdir(), 'assembly-import-'));
  const src = join(d, 'source'),
    out = join(d, 'private');
  mkdirSync(src);
  mkdirSync(out, { mode: 0o700 });
  const mesh = Buffer.from('o floor__walls\nv 0 0 0\nv 4 0 0\nv 0 4 0\nf 1 2 3\n');
  const m = Buffer.from(
    JSON.stringify({
      units: 'feet',
      rooms: [
        {
          id: 'room',
          name: 'Synthetic Room',
          footprint: [
            [0, 0],
            [4, 0],
            [4, 4]
          ],
          wall_ids: ['wall']
        }
      ],
      walls: [{ id: 'wall', start: [0, 0], end: [4, 0], thickness_ft: 0.5, height_ft: 7 }],
      openings: []
    })
  );
  const a = {
    schema_version: 1,
    units: 'feet',
    coordinate_system: 'X=east Y=up Z=north; absolute Revit Z elevations',
    obj: 'scene.obj',
    obj_sha256: sha(mesh),
    baseline: { models: { floor: { path: 'floor.json', sha256: sha(m) } } },
    levels: { floor: { floor_elevation_ft: 0, ceiling_elevation_ft: 7 } },
    validation: { errors: [], baseline_unchanged: true },
    elements: { floor__walls: { level: 'floor', kind: 'wall' } }
  };
  writeFileSync(join(src, 'floor.json'), m);
  writeFileSync(join(src, 'scene.obj'), mesh);
  writeFileSync(join(src, 'assembly.json'), JSON.stringify(a));
  const canonical = join(d, 'home.json');
  writeFileSync(
    canonical,
    JSON.stringify({
      id: 'example',
      revision: 1,
      ownerUserId: '11111111-1111-4111-8111-111111111111'
    })
  );
  return { d, src, out, a, canonical };
}
function run(/** @type {any} */ f) {
  return spawnSync(
    process.execPath,
    [
      resolve('scripts/import-assembly.mjs'),
      f.src,
      'assembly.json',
      'example',
      f.canonical,
      'version-1',
      f.out
    ],
    { encoding: 'utf8' }
  );
}
test('offline CLI preserves exact originals and immutable private retries', () => {
  const f = setup();
  try {
    const original = readFileSync(join(f.src, 'scene.obj'));
    const first = run(f);
    expect(first.status, first.stderr).toBe(0);
    const p = JSON.parse(readFileSync(join(f.out, 'preview.json'), 'utf8'));
    expect(p.rooms[0].id).toBe('floor:room');
    expect(readFileSync(join(f.out, p.mesh.filename))).toEqual(original);
    expect(readFileSync(join(f.src, 'scene.obj'))).toEqual(original);
    expect(run(f).status).toBe(0);
    writeFileSync(join(f.out, 'preview.json'), 'corrupt', { mode: 0o600 });
    const retry = run(f);
    expect(retry.status).not.toBe(0);
    expect(readFileSync(join(f.out, 'preview.json'), 'utf8')).toBe('corrupt');
  } finally {
    rmSync(f.d, { recursive: true, force: true });
  }
});
test('escaping or symlink source paths hold before private output writes', () => {
  for (const kind of ['escape', 'symlink']) {
    const f = setup();
    try {
      if (kind === 'escape') {
        f.a.baseline.models.floor.path = '../home.json';
        writeFileSync(join(f.src, 'assembly.json'), JSON.stringify(f.a));
      } else {
        rmSync(join(f.src, 'floor.json'));
        symlinkSync(f.canonical, join(f.src, 'floor.json'));
      }
      const r = run(f);
      expect(r.status).not.toBe(0);
      expect(readdirSync(f.out)).toEqual([]);
    } finally {
      rmSync(f.d, { recursive: true, force: true });
    }
  }
});
