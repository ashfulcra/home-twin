import { test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { importAssembly } from '../../../scripts/assembly-import.mjs';
import { loadAssemblyPreview } from './assembly-preview.js';
const bytes = (/** @type {any} */ v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v));
const sha = (/** @type {any} */ v) => createHash('sha256').update(v).digest('hex');
function setup() {
  const owner = '11111111-1111-4111-8111-111111111111',
    text = JSON.stringify({ id: 'example', ownerUserId: owner, revision: 1 });
  const access = {
    userId: owner,
    ownerUserId: owner,
    role: 'maintainer',
    root: '/home/twin',
    file: { id: 'v1', text },
    home: JSON.parse(text)
  };
  const model = bytes({
    units: 'feet',
    rooms: [
      {
        id: 'room',
        name: 'Synthetic room',
        footprint: [
          [0, 0],
          [4, 0],
          [4, 4]
        ],
        wall_ids: ['wall']
      }
    ],
    walls: [{ id: 'wall', start: [0, 0], end: [4, 0], height_ft: 7, thickness_ft: 0.5 }],
    openings: []
  });
  const mesh = bytes('o floor__walls\nv 0 0 0\nv 4 0 0\nv 0 4 0\nf 1 2 3\n');
  const assembly = bytes({
    schema_version: 1,
    units: 'feet',
    coordinate_system: 'X=east Y=up Z=north; absolute Revit Z elevations',
    baseline: { models: { floor: { path: 'floor.json', sha256: sha(model) } } },
    levels: { floor: { floor_elevation_ft: 0, ceiling_elevation_ft: 7 } },
    obj_sha256: sha(mesh),
    elements: { floor__walls: { kind: 'wall', level: 'floor' } },
    validation: { errors: [], baseline_unchanged: true }
  });
  const p = importAssembly(
      { assemblyBytes: assembly, models: { floor: model }, meshBytes: mesh },
      { homeId: 'example', canonicalFileVersion: 'v1', canonicalDigest: sha(bytes(text)) }
    ),
    packageBytes = bytes(p),
    digest = sha(packageBytes);
  const files = new Map(
    /** @type {any} */ ([
      ['/home/twin/home.json', { id: 'v1', bytes: bytes(text) }],
      [
        '/home/twin/assembly-preview.json',
        {
          id: 'pointer',
          bytes: bytes({
            schema: 'home-twin-assembly-preview-pointer/1',
            homeId: 'example',
            digest
          })
        }
      ],
      ['/home/twin/assembly-preview/' + digest + '.json', { id: 'package', bytes: packageBytes }],
      ...[
        [sha(model) + '.json', model],
        [sha(assembly) + '.json', assembly],
        [sha(mesh) + '.obj', mesh]
      ].map(([name, b]) => ['/home/twin/assembly-preview/' + name, { id: name, bytes: b }])
    ])
  );
  const read = vi.fn(async (/** @type {string} */ path) => files.get(path) ?? null);
  return { access, p, mesh, digest, files, reader: { read } };
}
test('current owner preview reconstructs source receipts and returns original mesh read-only', async () => {
  const f = setup();
  const result = await loadAssemblyPreview(f.access, f.reader, async () => f.access);
  if (!result) throw Error('expected preview');
  expect(result.model).toEqual(f.p);
  expect(result.meshBytes).toEqual(f.mesh);
  expect(result.previewDigest).toBe(f.digest);
  expect(f.reader.read.mock.calls.every((c) => c[0].startsWith('/home/twin/'))).toBe(true);
});
test('nonowner, viewer and changed owner never receive private source preview', async () => {
  for (const bad of ['caller', 'role', 'owner']) {
    const f = setup(),
      a = { ...f.access };
    if (bad === 'caller') a.userId = '22222222-2222-4222-8222-222222222222';
    if (bad === 'role') a.role = 'viewer';
    if (bad === 'owner')
      a.home = { ...a.home, ownerUserId: '22222222-2222-4222-8222-222222222222' };
    await expect(loadAssemblyPreview(a, f.reader, async () => a)).rejects.toThrow(/owner/i);
    expect(f.reader.read).not.toHaveBeenCalled();
  }
});
test('stale source digest, changed canonical bytes or missing archive hold', async () => {
  for (const bad of ['digest', 'home', 'archive']) {
    const f = setup();
    if (bad === 'home')
      f.files.set('/home/twin/home.json', {
        id: 'v2',
        bytes: bytes({ ...f.access.home, revision: 2 })
      });
    if (bad === 'archive') f.files.delete('/home/twin/assembly-preview/' + sha(f.mesh) + '.obj');
    await expect(
      loadAssemblyPreview(
        f.access,
        f.reader,
        async () => f.access,
        bad === 'digest' ? 'a'.repeat(64) : undefined
      )
    ).rejects.toThrow();
  }
});
test('verified absent pointer differs from source outage and mid-read identity change', async () => {
  const f = setup();
  f.files.delete('/home/twin/assembly-preview.json');
  expect(await loadAssemblyPreview(f.access, f.reader, async () => f.access)).toBeNull();
  const g = setup();
  g.reader.read.mockRejectedValue(Error('access outage'));
  await expect(loadAssemblyPreview(g.access, g.reader, async () => g.access)).rejects.toThrow(
    /outage/i
  );
  const h = setup();
  await expect(
    loadAssemblyPreview(h.access, h.reader, async () => ({ ...h.access, role: 'viewer' }))
  ).rejects.toThrow(/owner/i);
});

test('verified original source remains inspectable after a same-home service record update without rebasing it', async () => {
  const f = setup();
  const text = JSON.stringify({
    ...f.access.home,
    revision: 2,
    history: [
      {
        id: 'visit',
        kind: 'maintenance',
        status: 'completed',
        performedAt: '2026-01-01',
        summary: 'Synthetic service record'
      }
    ]
  });
  const current = { ...f.access, file: { id: 'v2', text }, home: JSON.parse(text) };
  f.files.set('/home/twin/home.json', { id: 'v2', bytes: bytes(text) });
  const result = await loadAssemblyPreview(current, f.reader, async () => current);
  expect(result?.baselineCurrent).toBe(false);
  expect(result?.model).toEqual(f.p);
  expect(result?.meshBytes).toEqual(f.mesh);
  expect(result?.model.homeBinding.canonicalFileVersion).toBe('v1');
  expect(result?.previewDigest).toBe(f.digest);
  const unchanged = setup();
  expect(
    (await loadAssemblyPreview(unchanged.access, unchanged.reader, async () => unchanged.access))
      ?.baselineCurrent
  ).toBe(true);
});
test('historical reference still holds when current canonical changes during source retrieval', async () => {
  const f = setup();
  let reads = 0;
  const read = f.reader.read;
  f.reader.read = vi.fn(async (path) => {
    if (path === '/home/twin/home.json' && ++reads === 2)
      return { id: 'v2', bytes: bytes({ ...f.access.home, revision: 2 }) };
    return read(path);
  });
  await expect(loadAssemblyPreview(f.access, f.reader, async () => f.access)).rejects.toThrow(
    /baseline changed/i
  );
});
test('a hash-valid source package for another home is denied even to the current owner', async () => {
  const f = setup();
  const p = { ...f.p, homeBinding: { ...f.p.homeBinding, homeId: 'another-home' } },
    raw = bytes(p),
    digest = sha(raw);
  f.files.set('/home/twin/assembly-preview.json', {
    id: 'changed-pointer',
    bytes: bytes({ schema: 'home-twin-assembly-preview-pointer/1', homeId: 'example', digest })
  });
  f.files.set('/home/twin/assembly-preview/' + digest + '.json', {
    id: 'foreign-package',
    bytes: raw
  });
  await expect(loadAssemblyPreview(f.access, f.reader, async () => f.access)).rejects.toThrow();
});

test('historical reference refuses malformed hash-valid import bindings', async () => {
  for (const patch of [
    { canonicalFileVersion: 0 },
    { canonicalFileVersion: '' },
    { canonicalDigest: 0 },
    { canonicalDigest: 'invalid' }
  ]) {
    const f = setup(),
      p = { ...f.p, homeBinding: { ...f.p.homeBinding, ...patch } },
      raw = bytes(p),
      digest = sha(raw);
    f.files.set('/home/twin/assembly-preview.json', {
      id: 'changed-pointer',
      bytes: bytes({ schema: 'home-twin-assembly-preview-pointer/1', homeId: 'example', digest })
    });
    f.files.set('/home/twin/assembly-preview/' + digest + '.json', {
      id: 'invalid-package',
      bytes: raw
    });
    await expect(loadAssemblyPreview(f.access, f.reader, async () => f.access)).rejects.toThrow(
      /invalid home baseline binding/i
    );
  }
});
