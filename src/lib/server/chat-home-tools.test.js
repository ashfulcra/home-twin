import { test, expect } from 'vitest';
import { createChatHomeTools } from '../../../scripts/chat-home-tools.mjs';
const home = {
  id: 'example',
  name: 'Example Home',
  revision: 1,
  ownerUserId: '33333333-3333-4333-8333-333333333333',
  sources: [
    {
      id: 'source-1',
      title: 'Record',
      attachment: {
        path: '/Example/twin/sources/record.txt',
        sha256: 'a'.repeat(64),
        contentType: 'text/plain'
      }
    }
  ],
  rooms: [],
  equipment: [],
  history: [],
  schedules: [],
  contacts: []
};
test('viewer accepted-source read does not attempt contributor-only upload recovery', async () => {
  const tools = createChatHomeTools({
    authorize: async () => ({ home, role: 'viewer' }),
    uploadedSource: async () => {
      throw Error('Upload role read-only');
    },
    readSource: async () => ({ id: 'source-1', text: 'Accepted record' })
  });
  expect(await tools.execute('read_source', { sourceId: 'source-1' })).toMatchObject({
    text: 'Accepted record'
  });
});
test('tools re-authorize each call and never accept arbitrary vault paths', async () => {
  let checks = 0;
  const tools = createChatHomeTools({
    authorize: async () => {
      checks++;
      return {
        home,
        root: '/Example/twin',
        userId: home.ownerUserId,
        ownerUserId: home.ownerUserId,
        role: 'maintainer'
      };
    },
    readSource: async () => ({ title: 'Record' })
  });
  expect(await tools.execute('read_home', {})).toMatchObject({ name: 'Example Home', revision: 1 });
  await expect(tools.execute('read_source', { path: '/Other/private' })).rejects.toThrow(
    /arguments/i
  );
  await expect(tools.execute('shell', { command: 'cat secrets' })).rejects.toThrow(/tool/i);
  expect(checks).toBe(1);
});
test('source lookup is ID-bound to current home and revocation stops reads', async () => {
  let revoked = false,
    reads = 0;
  const tools = createChatHomeTools({
    authorize: async () => {
      if (revoked) throw Error('revoked');
      return { home, role: 'viewer' };
    },
    readSource: async (/** @type {any} */ source) => {
      reads++;
      return { id: source.id };
    }
  });
  expect(await tools.execute('read_source', { sourceId: 'source-1' })).toEqual({ id: 'source-1' });
  await expect(tools.execute('read_source', { sourceId: 'foreign' })).rejects.toThrow(/source/i);
  revoked = true;
  await expect(tools.execute('read_home', {})).rejects.toThrow(/revoked/i);
  expect(reads).toBe(1);
});
