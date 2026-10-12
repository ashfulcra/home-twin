import * as THREE from 'three';
import { createSourceGroup } from './assembly-renderer.js';
import { test, expect, vi } from 'vitest';
import { renderPoint, planPoint, loadPreviewMesh } from './assembly-view.js';
test('north reflection occurs once at rendering without mutating canonical coordinates', () => {
  const p = [4, 7, 9],
    q = [4, 9];
  expect(renderPoint(p)).toEqual([4, 7, -9]);
  expect(planPoint(q)).toEqual([4, -9]);
  expect(p).toEqual([4, 7, 9]);
  expect(q).toEqual([4, 9]);
});
test('bounded original mesh chunks are recombined and byte-hash verified', async () => {
  const b = new Uint8Array(4 * 1024 * 1024 + 5).fill(65),
    hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
  const info = {
    previewDigest: 'a'.repeat(64),
    meshParts: 2,
    meshSizeBytes: b.length,
    model: { mesh: { sha256: hash } }
  };
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(b.slice(0, 4 * 1024 * 1024), {
        headers: { 'X-Preview-Digest': info.previewDigest }
      })
    )
    .mockResolvedValueOnce(
      new Response(b.slice(4 * 1024 * 1024), {
        headers: { 'X-Preview-Digest': info.previewDigest }
      })
    );
  expect(Buffer.from(await loadPreviewMesh(info, send)).equals(Buffer.from(b))).toBe(true);
  expect(
    send.mock.calls.every((c) =>
      String(c[0]).startsWith('/api/home/assembly-preview?mesh=1&digest=')
    )
  ).toBe(true);
});
test('stale chunk identity, bad checksum and invalid resource declarations hold', async () => {
  for (const issue of ['digest', 'hash', 'size']) {
    const info = {
      previewDigest: 'a'.repeat(64),
      meshParts: 1,
      meshSizeBytes: issue === 'size' ? 17 * 1024 * 1024 : 1,
      model: { mesh: { sha256: 'b'.repeat(64) } }
    };
    const send = vi.fn().mockResolvedValue(
      new Response('x', {
        headers: { 'X-Preview-Digest': issue === 'digest' ? 'c'.repeat(64) : info.previewDigest }
      })
    );
    await expect(loadPreviewMesh(info, send)).rejects.toThrow();
    if (issue === 'size') expect(send).not.toHaveBeenCalled();
  }
});

test('actual source group preserves east/up and reflects source north only once', () => {
  const root = createSourceGroup(),
    mesh = new THREE.Object3D();
  mesh.position.set(4, 7, 9);
  root.add(mesh);
  root.updateMatrixWorld(true);
  expect(mesh.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([4, 7, -9]);
  expect(mesh.position.toArray()).toEqual([4, 7, 9]);
});

test('camera bounds frame only visible source geometry in world coordinates', async () => {
  const { sourceViewBounds } = await import('./assembly-renderer.js');
  const root = createSourceGroup();
  const shown = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6));
  shown.position.set(2, -6, 3);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
  hidden.position.set(100, 100, 100);
  hidden.visible = false;
  root.add(shown, hidden);
  root.updateMatrixWorld(true);
  const b = sourceViewBounds([shown, hidden]);
  expect(b.getCenter(new THREE.Vector3()).toArray()).toEqual([2, -6, -3]);
  expect(b.getSize(new THREE.Vector3()).toArray()).toEqual([4, 2, 6]);
  shown.geometry.dispose();
  hidden.geometry.dispose();
});
