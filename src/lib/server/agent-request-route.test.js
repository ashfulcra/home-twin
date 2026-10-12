import { test, expect, vi, beforeEach } from 'vitest';
import { assemblyBriefFixture } from '../home/assembly-brief-fixture.js';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), reader: vi.fn(), load: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: mocks.resolve }));
vi.mock('$lib/server/assembly-preview-reader.js', () => ({ assemblyPreviewReader: mocks.reader }));
vi.mock('$lib/server/assembly-preview.js', () => ({ loadAssemblyPreview: mocks.load }));
import { GET } from '../../routes/api/home/agent-request/+server.js';
const owner = '11111111-1111-4111-8111-111111111111';
const home = {
  schemaVersion: 1,
  revision: 1,
  id: 'example-home',
  name: 'Example',
  ownerUserId: owner,
  rooms: [],
  equipment: [],
  history: [],
  contacts: [],
  schedules: [],
  sources: []
};
const access = {
  userId: owner,
  ownerUserId: owner,
  home,
  role: 'maintainer',
  endpoint: 'https://example.test/',
  root: '/home/twin',
  file: { id: 'v1', text: JSON.stringify(home) }
};
/** @param {boolean} [auth] @returns {any} */
const event = (auth = true) => ({ cookies: { get: () => (auth ? 'caller-token' : null) } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(access);
  mocks.load.mockResolvedValue(assemblyBriefFixture());
});
test('owner download includes a separate verified reference and private attachment headers', async () => {
  const r = await GET(event());
  const b = await r.json();
  expect(b.sourceReference.status).toBe('available');
  expect(b.sourceReference.model.rooms[0].id).toBe('upper:closet-a');
  expect(b.home.rooms).toEqual([]);
  expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  expect(r.headers.get('Content-Disposition')).toContain('attachment;');
  expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(mocks.reader).toHaveBeenCalledWith(access.endpoint, 'caller-token', access.root);
});
test('anonymous and member downloads cannot read or export the owner source model', async () => {
  await expect(GET(event(false))).rejects.toMatchObject({ status: 401 });
  for (const role of ['viewer', 'contributor']) {
    mocks.resolve.mockResolvedValue({
      ...access,
      role,
      userId: '22222222-2222-4222-8222-222222222222'
    });
    const b = await (await GET(event())).json();
    expect(b.sourceReference.status).toBe('private-owner-only');
    expect(b.sourceReference.model).toBeUndefined();
  }
  expect(mocks.reader).not.toHaveBeenCalled();
  expect(mocks.load).not.toHaveBeenCalled();
});
test('unreadable source never becomes confirmed absence or suppresses accepted facts', async () => {
  mocks.load.mockResolvedValue(null);
  expect((await (await GET(event())).json()).sourceReference.status).toBe('not-recorded');
  mocks.load.mockRejectedValue(Error('credential-sensitive downstream detail'));
  const b = await (await GET(event())).json();
  expect(b.sourceReference.status).toBe('unverified');
  expect(b.home.id).toBe('example-home');
  expect(JSON.stringify(b)).not.toContain('credential-sensitive');
  expect(b.questions.some((/** @type {any} */ q) => q.kind === 'layout')).toBe(false);
});
test('access or raw canonical drift during owner source reads holds the entire brief', async () => {
  for (const patch of [
    { file: { ...access.file, id: 'v2' } },
    { file: { ...access.file, text: access.file.text + ' ' } },
    { userId: 'other' },
    { role: 'viewer' },
    { root: '/Other/twin' }
  ]) {
    mocks.resolve.mockReset();
    mocks.resolve.mockResolvedValueOnce(access).mockResolvedValue({ ...access, ...patch });
    await expect(GET(event())).rejects.toMatchObject({ status: 409 });
  }
  mocks.resolve.mockReset();
  mocks.resolve
    .mockResolvedValueOnce(access)
    .mockRejectedValue(Object.assign(Error('revoked'), { status: 403 }));
  mocks.load.mockRejectedValue(Error('source unreadable'));
  await expect(GET(event())).rejects.toMatchObject({ status: 403 });
});
