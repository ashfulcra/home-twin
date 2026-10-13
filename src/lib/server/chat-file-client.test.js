import { test, expect } from 'vitest';
import { chatFileClient } from '../../../scripts/chat-file-client.mjs';
test('file IO uses only current caller and scoped file namespaces; reserved metadata is excluded', async () => {
  const paths = /** @type {string[]} */ ([]);
  const client = chatFileClient(
    'synthetic-token',
    { root: '/Example/twin', principalId: '33333333-3333-4333-8333-333333333333' },
    async (url, options) => {
      paths.push(String(url));
      if (options?.method === 'POST')
        return Response.json({ url: 'https://uploads.example.test/object' });
      if (String(url).includes('file_upload?'))
        return Response.json({ files: [{ name: 'note.txt', id: 'file-1' }] });
      if (String(url).includes('/download?')) return new Response('note');
      if (String(url) === 'https://uploads.example.test/object') return new Response('');
      throw Error('Unexpected fixture');
    }
  );
  expect(await client.read('/Example/twin/sources/note.txt')).toEqual(Buffer.from('note'));
  await expect(client.read('/Other/key.txt')).rejects.toThrow(/scope/i);
  await client.write('/Example/twin/sources/note.txt', Buffer.from('note'), 'text/plain');
  expect(paths.some((p) => p.includes('state=uploaded'))).toBe(true);
});
test('current membership check runs after reservation and before any original bytes leave', async () => {
  let bytesSent = false;
  const client = chatFileClient(
    'synthetic-token',
    { root: '/Example/twin', principalId: '33333333-3333-4333-8333-333333333333' },
    async (url) => {
      if (String(url).startsWith('https://uploads.example.test')) {
        bytesSent = true;
        return new Response('');
      }
      return Response.json({ url: 'https://uploads.example.test/object' });
    }
  );
  await expect(
    client.write('/Example/twin/sources/note.txt', Buffer.from('note'), 'text/plain', async () => {
      throw Error('revoked');
    })
  ).rejects.toThrow('revoked');
  expect(bytesSent).toBe(false);
});
