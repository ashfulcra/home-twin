import { test, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), call: vi.fn() }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: mocks.resolve }));
vi.mock('$lib/server/chat-service.js', () => ({ callChatService: mocks.call }));
import { GET, POST } from '../../routes/api/home/chat/+server.js';
import { GET as events } from '../../routes/api/home/chat/events/+server.js';
import { POST as saveRecord } from '../../routes/api/home/chat/actions/+server.js';
import { POST as cancel } from '../../routes/api/home/chat/cancel/+server.js';
const conversationId = '11111111-1111-4111-8111-111111111111',
  input = {
    conversationId,
    turnId: '22222222-2222-4222-8222-222222222222',
    message: 'Question',
    attachmentIds: []
  };
/** @param {any} body @param {boolean} [auth] @param {string} [query] @returns {any} */ const event =
  (body, auth = true, query = '') => ({
    cookies: { get: () => (auth ? 'current-caller' : null) },
    request: new Request('https://example.test/', { method: 'POST', body: JSON.stringify(body) }),
    url: new URL('https://example.test/?' + query)
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ home: { id: 'example' }, role: 'viewer', joining: false });
  mocks.call.mockResolvedValue({ available: true });
});
test('chat resolves current signed-in home and accepts no client authority', async () => {
  const r = await POST(event(input));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith('current-caller', 'example', 'turn', {
    input
  });
  await expect(POST(event({ ...input, root: '/Other' }))).rejects.toMatchObject({ status: 400 });
  await expect(POST(event({ ...input, principalId: 'other' }))).rejects.toMatchObject({
    status: 400
  });
});
test('anonymous pending and revoked callers fail before worker/model access', async () => {
  await expect(GET(event({}, false))).rejects.toMatchObject({ status: 401 });
  for (const value of [
    { home: null, joining: true, role: null },
    { home: { id: 'example' }, role: null }
  ]) {
    mocks.resolve.mockResolvedValue(value);
    await expect(POST(event(input))).rejects.toMatchObject({ status: 403 });
  }
  expect(mocks.call).not.toHaveBeenCalled();
});
test('oversize input, invalid cursor and arbitrary conversation path are rejected', async () => {
  await expect(POST(event({ ...input, message: 'x'.repeat(20000) }))).rejects.toMatchObject({
    status: 400
  });
  await expect(events(event({}, true, 'conversationId=../other&cursor=0'))).rejects.toMatchObject({
    status: 400
  });
  await expect(
    events(event({}, true, 'conversationId=' + conversationId + '&cursor=-1'))
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.call).not.toHaveBeenCalled();
});
test('events and explicit cancel relay only current home and stable conversation', async () => {
  mocks.call.mockResolvedValue({ events: [], turns: [] });
  const r = await events(event({}, true, 'conversationId=' + conversationId + '&cursor=4'));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.call).toHaveBeenCalledWith('current-caller', 'example', 'events', {
    conversationId,
    cursor: 4
  });
  await cancel(event({ conversationId }));
  expect(mocks.call).toHaveBeenCalledWith('current-caller', 'example', 'cancel', {
    conversationId
  });
});
test('worker outage has a bounded generic message without credentials', async () => {
  mocks.call.mockRejectedValue(Error('current-caller dedicated-key'));
  await expect(POST(event(input))).rejects.toMatchObject({ status: 503 });
  try {
    await POST(event(input));
  } catch (e) {
    expect(JSON.stringify(e)).not.toContain('current-caller');
  }
});

const approval = { conversationId, actionId: input.turnId, digest: 'a'.repeat(64) };
test('record approval relays only an exact saved decision using current writer access', async () => {
  mocks.resolve.mockResolvedValue({ home: { id: 'example' }, role: 'maintainer' });
  const r = await saveRecord(event(approval));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith('current-caller', 'example', 'apply-record', {
    input: approval
  });
});
test('record approval refuses viewers, anonymous callers, injected scope and malformed decisions before effects', async () => {
  await expect(saveRecord(event(approval))).rejects.toMatchObject({ status: 403 });
  await expect(saveRecord(event(approval, false))).rejects.toMatchObject({ status: 401 });
  mocks.resolve.mockResolvedValue({ home: { id: 'example' }, role: 'contributor' });
  for (const body of [
    { ...approval, root: '/other' },
    { ...approval, token: 'other' },
    { ...approval, actionId: '../x' },
    { ...approval, digest: 'not-exact' },
    null,
    { ...approval, digest: 'a'.repeat(17000) }
  ])
    await expect(saveRecord(event(body))).rejects.toMatchObject({ status: 400 });
  expect(mocks.call).not.toHaveBeenCalled();
});
