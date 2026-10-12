import { test, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), reader: vi.fn(), load: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: mocks.resolve }));
vi.mock('$lib/server/assembly-preview-reader.js', () => ({ assemblyPreviewReader: mocks.reader }));
vi.mock('$lib/server/assembly-preview.js', () => ({ loadAssemblyPreview: mocks.load }));
import { GET } from '../../routes/api/home/assembly-preview/+server.js';
const owner = '11111111-1111-4111-8111-111111111111';
const access = {
  userId: owner,
  ownerUserId: owner,
  home: { ownerUserId: owner },
  role: 'maintainer',
  endpoint: 'https://example.test/',
  root: '/Example/twin'
};
/** @param {string} [query] @param {boolean} [auth] @returns {any} */
const event = (query = '', auth = true) => ({
  cookies: { get: () => (auth ? 'caller-token' : null) },
  url: new URL('https://example.test/api/home/assembly-preview' + query)
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(access);
  mocks.load.mockResolvedValue(null);
});
test('anonymous and nonowner requests never reach private source reader', async () => {
  await expect(GET(event('', false))).rejects.toMatchObject({ status: 401 });
  for (const patch of [
    { userId: 'other' },
    { role: 'viewer' },
    { home: { ownerUserId: 'other' } }
  ]) {
    mocks.resolve.mockResolvedValue({ ...access, ...patch });
    await expect(GET(event())).rejects.toMatchObject({ status: 403 });
  }
  expect(mocks.reader).not.toHaveBeenCalled();
});
test('invalid mesh selectors are rejected before any source read', async () => {
  for (const query of [
    '?mesh=2',
    '?mesh=1',
    '?part=0',
    '?mesh=1&digest=' + 'a'.repeat(64) + '&part=4'
  ])
    await expect(GET(event(query))).rejects.toMatchObject({ status: 400 });
  expect(mocks.reader).not.toHaveBeenCalled();
});
test('metadata and bounded mesh parts are private current-caller responses', async () => {
  const raw = new Uint8Array(4 * 1024 * 1024 + 3).fill(65),
    digest = 'a'.repeat(64);
  mocks.load.mockResolvedValue({
    previewDigest: digest,
    baselineCurrent: false,
    model: { status: 'source-preview-needs-review' },
    meshBytes: raw
  });
  const meta = await GET(event());
  expect(meta.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await meta.json()).toMatchObject({
    previewDigest: digest,
    baselineCurrent: false,
    meshParts: 2,
    meshSizeBytes: raw.length
  });
  for (const part of [0, 1]) {
    const response = await GET(event('?mesh=1&digest=' + digest + '&part=' + part));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Preview-Digest')).toBe(digest);
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const b = new Uint8Array(await response.arrayBuffer());
    expect(b.length).toBe(part ? 3 : 4 * 1024 * 1024);
    expect(b.every((v) => v === 65)).toBe(true);
  }
  await expect(GET(event('?mesh=1&digest=' + digest + '&part=2'))).rejects.toMatchObject({
    status: 400
  });
  expect(mocks.reader).toHaveBeenCalledWith(access.endpoint, 'caller-token', access.root);
});
test('confirmed absence differs from unavailable or stale sources without leaking downstream details', async () => {
  expect(await (await GET(event())).json()).toEqual({ status: 'not-available' });
  await expect(GET(event('?mesh=1&digest=' + 'a'.repeat(64)))).rejects.toMatchObject({
    status: 404
  });
  for (const status of [409, 503]) {
    mocks.load.mockRejectedValue(Object.assign(Error('private downstream detail'), { status }));
    try {
      await GET(event());
      throw Error('expected hold');
    } catch (e) {
      expect(e).toMatchObject({ status });
      expect(JSON.stringify(e)).not.toContain('private downstream detail');
    }
  }
});
