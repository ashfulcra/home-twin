import { test, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), call: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: mocks.resolve }));
vi.mock('$lib/server/chat-service.js', () => ({ callChatService: mocks.call }));
import { POST } from '../../routes/api/home/chat/source-actions/+server.js';
const owner = '33333333-3333-4333-8333-333333333333',
  actionId = '11111111-1111-4111-8111-111111111111',
  digest = 'a'.repeat(64);
const bodies = [
  { operation: 'review', value: { sourceId: 'evidence-' + actionId } },
  { operation: 'save', value: { actionId, digest } },
  { operation: 'status', value: { actionId, digest } }
];
/** @param {any} body @param {boolean} [auth] @returns {any} */ const event = (
  body,
  auth = true
) => ({
  cookies: { get: () => (auth ? 'synthetic-caller' : null) },
  request: new Request('https://example.test/', { method: 'POST', body: JSON.stringify(body) })
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({
    home: { id: 'example', ownerUserId: owner },
    userId: owner,
    ownerUserId: owner,
    role: 'maintainer'
  });
  mocks.call.mockResolvedValue({ status: 'checking-source', requestSaved: true });
});
test('owner-only source routes relay exact current-cookie request without cache or client authority', async () => {
  for (const [n, action] of ['source-review', 'save-source', 'source-status'].entries()) {
    const r = await POST(event(bodies[n]));
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.call).toHaveBeenLastCalledWith('synthetic-caller', 'example', action, {
      input: bodies[n].value
    });
  }
});
test('anonymous viewers contributors and another account cannot prepare save or poll source jobs', async () => {
  for (const body of bodies) {
    await expect(POST(event(body, false))).rejects.toMatchObject({ status: 401 });
    for (const role of ['viewer', 'contributor', 'maintainer']) {
      mocks.resolve.mockResolvedValue({
        home: { id: 'example', ownerUserId: owner },
        userId: '44444444-4444-4444-8444-444444444444',
        ownerUserId: owner,
        role
      });
      await expect(POST(event(body))).rejects.toMatchObject({ status: 403 });
    }
  }
  expect(mocks.call).not.toHaveBeenCalled();
});
test('source routes reject malformed identities missing fields and injected home record or authority', async () => {
  for (const body of [
    ...bodies.map((b) => ({ ...b, root: '/Other/twin' })),
    ...bodies.map((b) => ({ ...b, value: { ...b.value, role: 'maintainer' } })),
    { operation: 'save', value: { actionId, digest: 'bad' } },
    { operation: 'review', value: { sourceId: 'source-3' } },
    { operation: 'save', value: { actionId } },
    { operation: 'apply', value: { actionId, digest } }
  ])
    await expect(POST(event(body))).rejects.toMatchObject({ status: 400 });
  expect(mocks.call).not.toHaveBeenCalled();
});
