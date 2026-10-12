/** View boundary only; stored source coordinates remain unchanged. @param {number[]} p */
export const renderPoint = (p) => [p[0], p[1], -p[2]];
/** @param {number[]} p */
export const planPoint = (p) => [p[0], -p[1]];
/** Browser-only authenticated chunk delivery. No OBJ material/texture references are fetched.
 * @param {any} info @param {typeof fetch} [send] @param {AbortSignal} [signal] */
export async function loadPreviewMesh(info, send = fetch, signal) {
  const size = info.meshSizeBytes,
    count = info.meshParts,
    partBytes = 4 * 1024 * 1024;
  if (
    !Number.isInteger(size) ||
    size <= 0 ||
    size > 16 * 1024 * 1024 ||
    !Number.isInteger(count) ||
    count !== Math.ceil(size / partBytes) ||
    !/^([a-f0-9]{64})$/.test(info.previewDigest) ||
    !/^([a-f0-9]{64})$/.test(info.model?.mesh?.sha256)
  )
    throw Error('Invalid source mesh resource bounds');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const r = await send(
      '/api/home/assembly-preview?mesh=1&digest=' +
        encodeURIComponent(info.previewDigest) +
        '&part=' +
        i,
      { cache: 'no-store', signal }
    );
    if (!r.ok || r.headers.get('X-Preview-Digest') !== info.previewDigest || !r.body)
      throw Error('Source mesh changed or is unavailable; refresh its preview');
    const reader = r.body.getReader(),
      expected = Math.min(partBytes, size - offset);
    let received = 0;
    try {
      while (true) {
        const p = await reader.read();
        if (p.done) break;
        if (received + p.value.length > expected) {
          await reader.cancel();
          throw Error('Source mesh part exceeded its bound');
        }
        bytes.set(p.value, offset + received);
        received += p.value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (received !== expected) throw Error('Source mesh part is incomplete');
    offset += received;
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== info.model.mesh.sha256) throw Error('Original source mesh checksum differs');
  return bytes;
}
