import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { modelPatchHome } from '../test-fixtures/model-patch.js';
import { loadModelComparison } from './model-comparison.js';
/** @param {string} s */
const bytes = (s) => new TextEncoder().encode(s);
/** @param {Uint8Array} b */
const digest = (b) => createHash('sha256').update(b).digest('hex');
const owner = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const access = {
    userId: owner,
    ownerUserId: owner,
    role: 'maintainer',
    root: '/Example/twin',
    home: { id: 'example', ownerUserId: owner },
    file: { id: 'home-version', text: '{"revision":1}' }
  };
  const model = modelPatchHome().reconstruction.buildingModel;
  const html = bytes(
    JSON.stringify({
      schema: 'home-twin-model-comparison/1',
      homeId: 'example',
      frozenAt: '2026-01-01',
      models: { current: model, a: model, b: model }
    })
  );
  const sha = digest(html);
  const pointer = bytes(
    JSON.stringify({
      schema: 'home-twin-model-comparison-pointer/1',
      homeId: 'example',
      digest: sha,
      frozenAt: '2026-01-01'
    })
  );
  /** @type {Map<string,{id:string,bytes:Uint8Array}>} */
  const files = new Map([
    [access.root + '/home.json', { id: access.file.id, bytes: bytes(access.file.text) }],
    [access.root + '/model-comparison.json', { id: 'pointer-version', bytes: pointer }],
    [access.root + '/model-comparison/' + sha + '.json', { id: 'html-version', bytes: html }]
  ]);
  /** @type {Array<{path:string,max:number}>} */ const calls = [];
  const reader = {
    read: async (/** @type {string} */ path, /** @type {number} */ max) => {
      calls.push({ path, max });
      return files.get(path) ?? null;
    }
  };
  return { access, html, sha, files, calls, reader, recheck: async () => access };
}
test('owner receives only exact archived preview bytes with frozen date', async () => {
  const f = fixture();
  const r = await loadModelComparison(f.access, f.reader, f.recheck);
  expect(r).toMatchObject({ digest: f.sha, frozenAt: '2026-01-01' });
  expect(r?.models.current.rooms[0].name).toBe('Living');
  expect(f.calls.every((x) => x.path.startsWith('/Example/twin/'))).toBe(true);
});
test('confirmed absence is distinct from unavailable archived bytes', async () => {
  const f = fixture();
  f.files.delete(f.access.root + '/model-comparison.json');
  expect(await loadModelComparison(f.access, f.reader, f.recheck)).toBeNull();
  const g = fixture();
  g.files.delete(g.access.root + '/model-comparison/' + g.sha + '.json');
  await expect(loadModelComparison(g.access, g.reader, g.recheck)).rejects.toMatchObject({
    status: 503
  });
});
test('foreign/viewer/invalid-root access never reads private files', async () => {
  for (const patch of [
    { role: 'viewer' },
    { userId: 'other' },
    { ownerUserId: 'other' },
    { home: { id: 'example', ownerUserId: 'other' } },
    { root: '/Elsewhere' }
  ]) {
    const f = fixture();
    await expect(
      loadModelComparison({ ...f.access, ...patch }, f.reader, f.recheck)
    ).rejects.toMatchObject({ status: 403 });
    expect(f.calls).toHaveLength(0);
  }
});
test('checksum mismatch and wrong home pointer are held', async () => {
  const f = fixture();
  f.files.set(f.access.root + '/model-comparison/' + f.sha + '.json', {
    id: 'html-version',
    bytes: bytes('different')
  });
  await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
    status: 409
  });
  const g = fixture();
  g.files.set(g.access.root + '/model-comparison.json', {
    id: 'pointer-version',
    bytes: bytes(
      JSON.stringify({
        schema: 'home-twin-model-comparison-pointer/1',
        homeId: 'other',
        digest: g.sha,
        frozenAt: '2026-01-01'
      })
    )
  });
  await expect(loadModelComparison(g.access, g.reader, g.recheck)).rejects.toMatchObject({
    status: 409
  });
});
test('oversize pointer/html and malformed pointer cannot become document responses', async () => {
  for (const [suffix, size] of [
    ['model-comparison.json', 2049],
    ['html', 2 * 1024 * 1024 + 1]
  ]) {
    const f = fixture();
    const path =
      f.access.root + '/' + (suffix === 'html' ? 'model-comparison/' + f.sha + '.json' : suffix);
    f.files.set(path, { id: 'oversized', bytes: new Uint8Array(Number(size)) });
    await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
      status: 503
    });
  }
  const f = fixture();
  f.files.set(f.access.root + '/model-comparison.json', {
    id: 'pointer-version',
    bytes: bytes('{')
  });
  await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
    status: 409
  });
});
test('revocation and changed home baseline during archive read hold all preview output', async () => {
  for (const patch of [{ role: 'viewer' }, { file: { id: 'next', text: '{"revision":2}' } }]) {
    const f = fixture();
    await expect(
      loadModelComparison(f.access, f.reader, async () => ({ ...f.access, ...patch }))
    ).rejects.toMatchObject({ status: patch.role ? 403 : 409 });
  }
  const f = fixture();
  f.files.set(f.access.root + '/home.json', { id: 'home-version', bytes: bytes('changed') });
  await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
    status: 409
  });
});
test('pointer change during final pointer read and wrong expected digest are held', async () => {
  const f = fixture();
  await expect(
    loadModelComparison(f.access, f.reader, f.recheck, 'a'.repeat(64))
  ).rejects.toMatchObject({ status: 409 });
  const g = fixture();
  let reads = 0;
  const read = g.reader.read;
  g.reader.read = async (path, max) => {
    const value = await read(path, max);
    if (path.endsWith('/model-comparison.json') && ++reads === 2)
      return { id: 'next', bytes: bytes('{}') };
    return value;
  };
  await expect(loadModelComparison(g.access, g.reader, g.recheck)).rejects.toMatchObject({
    status: 409
  });
});

test('active HTML content cannot become comparison data', async () => {
  const f = fixture();
  const b = bytes('<script>location="https://example.test/"</script>');
  const sha = digest(b);
  f.files.set(f.access.root + '/model-comparison.json', {
    id: 'pointer-version',
    bytes: bytes(
      JSON.stringify({
        schema: 'home-twin-model-comparison-pointer/1',
        homeId: 'example',
        digest: sha,
        frozenAt: '2026-01-01'
      })
    )
  });
  f.files.set(f.access.root + '/model-comparison/' + sha + '.json', { id: 'package', bytes: b });
  await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
    status: 409
  });
});

test('revocation during final pointer read is checked before private model return', async () => {
  const f = fixture();
  let count = 0,
    revoked = false;
  const read = f.reader.read;
  f.reader.read = async (path, max) => {
    const result = await read(path, max);
    if (path.endsWith('/model-comparison.json') && ++count === 2) revoked = true;
    return result;
  };
  await expect(
    loadModelComparison(f.access, f.reader, async () => ({
      ...f.access,
      role: revoked ? 'viewer' : 'maintainer'
    }))
  ).rejects.toMatchObject({ status: 403 });
});

test('same-byte new home version cannot mutate initial binding', async () => {
  const f = fixture();
  const read = f.reader.read;
  f.reader.read = async (path, max) => {
    const r = await read(path, max);
    if (path.includes('/model-comparison/')) {
      f.access.file.id = 'next';
      const old = f.files.get(f.access.root + '/home.json');
      if (old) old.id = 'next';
    }
    return r;
  };
  await expect(loadModelComparison(f.access, f.reader, f.recheck)).rejects.toMatchObject({
    status: 409
  });
});
