import { test, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), call: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: mocks.resolve }));
vi.mock('$lib/server/chat-service.js', () => ({ callChatService: mocks.call }));
import { POST as apply } from '../../routes/api/home/chat/model-actions/+server.js';
import { POST as status } from '../../routes/api/home/chat/model-status/+server.js';
const owner = '33333333-3333-4333-8333-333333333333',
  input = {
    conversationId: '11111111-1111-4111-8111-111111111111',
    actionId: '22222222-2222-4222-8222-222222222222',
    digest: 'a'.repeat(64)
  };
/** @param {any} body @param {boolean} [auth] @returns {any} */
const event = (body, auth = true) => ({
  cookies: { get: () => (auth ? 'synthetic-caller' : null) },
  request: new Request('https://example.test/', { method: 'POST', body: JSON.stringify(body) })
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({
    home: { id: 'example', ownerUserId: owner },
    userId: owner,
    ownerUserId: owner,
    role: 'maintainer',
    joining: false
  });
  mocks.call.mockResolvedValue({ status: 'checking-model-sources', approvalRecorded: false });
});
test('model Apply and status relay only the current owner exact identifiers with private caching', async () => {
  for (const [route, action] of /** @type {Array<[any,string]>} */ ([
    [apply, 'apply-model'],
    [status, 'model-status']
  ])) {
    const r = await route(event(input));
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.call).toHaveBeenLastCalledWith('synthetic-caller', 'example', action, { input });
  }
});
test('anonymous contributor viewer and another maintainer cannot request or poll model actions', async () => {
  for (const route of [apply, status]) {
    await expect(route(event(input, false))).rejects.toMatchObject({ status: 401 });
    for (const role of ['viewer', 'contributor', 'maintainer']) {
      mocks.resolve.mockResolvedValue({
        home: { id: 'example', ownerUserId: owner },
        userId: '44444444-4444-4444-8444-444444444444',
        ownerUserId: owner,
        role,
        joining: false
      });
      await expect(route(event(input))).rejects.toMatchObject({ status: 403 });
    }
  }
  expect(mocks.call).not.toHaveBeenCalled();
});
test('model requests reject client authority, missing keys and malformed operation digests', async () => {
  for (const route of [apply, status])
    for (const body of [
      { ...input, root: '/Elsewhere/twin' },
      { ...input, role: 'maintainer' },
      { ...input, patch: {} },
      { ...input, digest: 'bad' },
      { conversationId: input.conversationId, actionId: input.actionId }
    ])
      await expect(route(event(body))).rejects.toMatchObject({ status: 400 });
  expect(mocks.call).not.toHaveBeenCalled();
});
