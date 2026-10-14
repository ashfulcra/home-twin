import { test, expect, vi, beforeEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
const m = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), load: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: m.resolve }));
vi.mock('$lib/server/assembly-preview-reader.js', () => ({ assemblyPreviewReader: m.read }));
vi.mock('$lib/server/model-comparison.js', () => ({ loadModelComparison: m.load }));
import { GET } from '../../routes/api/home/model-comparison/+server.js';
const id = '11111111-1111-4111-8111-111111111111',
  sha = 'a'.repeat(64);
const access = {
  userId: id,
  ownerUserId: id,
  role: 'maintainer',
  home: { ownerUserId: id },
  root: '/Example/twin',
  endpoint: 'https://example.test/'
};
/** @returns {any} */ const event = (query = '', auth = true) => ({
  cookies: { get: () => (auth ? 'own-token' : null) },
  url: new URL('https://example.test/api/home/model-comparison' + query)
});
beforeEach(() => {
  vi.clearAllMocks();
  m.resolve.mockResolvedValue(access);
  m.load.mockResolvedValue({
    digest: sha,
    frozenAt: '2026-01-01',
    models: { current: { id: 'synthetic' }, a: { id: 'a' }, b: { id: 'b' } }
  });
});
test('anonymous and nonowner cannot fetch metadata or datas', async () => {
  await expect(GET(event('', false))).rejects.toMatchObject({ status: 401 });
  for (const patch of [
    { role: 'viewer' },
    { userId: 'other' },
    { home: { ownerUserId: 'other' } }
  ]) {
    m.resolve.mockResolvedValue({ ...access, ...patch });
    await expect(GET(event())).rejects.toMatchObject({ status: 403 });
  }
  expect(m.read).not.toHaveBeenCalled();
  expect(m.load).not.toHaveBeenCalled();
});
test('data selectors require exact digest and reject additional selectors', async () => {
  for (const q of [
    '?data=1',
    '?data=2',
    '?digest=' + sha,
    '?data=1&digest=' + sha + '&path=/private',
    '?data=1&digest=' + sha + '&digest=' + sha
  ])
    await expect(GET(event(q))).rejects.toMatchObject({ status: 400 });
  expect(m.load).not.toHaveBeenCalled();
});
test('metadata is private; exact frozen data is compressed and isolated from app/network authority', async () => {
  const meta = await GET(event());
  expect(await meta.json()).toEqual({ status: 'ready', digest: sha, frozenAt: '2026-01-01' });
  expect(meta.headers.get('cache-control')).toBe('private, no-store');
  const doc = await GET(event('?data=1&digest=' + sha));
  const parsed = JSON.parse(gunzipSync(new Uint8Array(await doc.arrayBuffer())).toString());
  expect(parsed.models.current.id).toBe('synthetic');
  expect(doc.headers.get('content-encoding')).toBe('gzip');
  expect(doc.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(doc.headers.get('cache-control')).toBe('private, no-store');
  expect(doc.headers.get('x-content-type-options')).toBe('nosniff');
  expect(m.read).toHaveBeenCalledWith(access.endpoint, 'own-token', access.root);
  expect(m.load.mock.calls[1][3]).toBe(sha);
});
test('verified absence is not an unavailable/revoked preview and downstream details stay private', async () => {
  m.load.mockResolvedValue(null);
  expect(await (await GET(event())).json()).toEqual({ status: 'not-available' });
  await expect(GET(event('?data=1&digest=' + sha))).rejects.toMatchObject({ status: 404 });
  for (const status of [403, 409, 503]) {
    m.load.mockRejectedValue(Object.assign(Error('private source detail'), { status }));
    try {
      await GET(event());
      throw Error('expected hold');
    } catch (e) {
      expect(e).toMatchObject({ status });
      expect(JSON.stringify(e)).not.toContain('private source detail');
    }
  }
});
