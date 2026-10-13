import { test, expect, vi, beforeEach } from 'vitest';
vi.mock('./chat-route.js', () => ({ chatAccess: vi.fn(), relayChat: vi.fn() }));
import { chatAccess, relayChat } from './chat-route.js';
import { POST } from '../../routes/api/home/chat/files/+server.js';
beforeEach(() => vi.resetAllMocks());
test('file relay derives home and caller from current authenticated session and rejects supplied authority', async () => {
  vi.mocked(chatAccess).mockResolvedValue(
    /** @type {any} */ ({
      token: 'caller-token',
      access: { role: 'contributor', home: { id: 'example' } }
    })
  );
  vi.mocked(relayChat).mockResolvedValue(new Response('{}'));
  await POST(
    /** @type {any} */ ({
      request: new Request('https://example.test', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'status',
          input: { uploadId: '11111111-1111-4111-8111-111111111111' }
        })
      })
    })
  );
  expect(vi.mocked(relayChat).mock.calls[0].slice(2)).toEqual([
    'file',
    { input: { operation: 'status', value: { uploadId: '11111111-1111-4111-8111-111111111111' } } }
  ]);
  await expect(
    POST(
      /** @type {any} */ ({
        request: new Request('https://example.test', {
          method: 'POST',
          body: JSON.stringify({ operation: 'status', input: {}, root: '/Other' })
        })
      })
    )
  ).rejects.toMatchObject({ status: 400 });
});
test('a viewer cannot upload files', async () => {
  vi.mocked(chatAccess).mockResolvedValue(
    /** @type {any} */ ({
      token: 'caller-token',
      access: { role: 'viewer', home: { id: 'example' } }
    })
  );
  await expect(
    POST(
      /** @type {any} */ ({
        request: new Request('https://example.test', { method: 'POST', body: '{}' })
      })
    )
  ).rejects.toMatchObject({ status: 403 });
  expect(relayChat).not.toHaveBeenCalled();
});
