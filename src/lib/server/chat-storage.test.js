import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { chatTranscriptArchive, chatSourceReader } from '../../../scripts/chat-storage.mjs';
const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  },
  conversationId = '11111111-1111-4111-8111-111111111111';
const record = {
  schema: 1,
  binding: {
    homeId: scope.homeId,
    principalId: scope.principalId,
    ownerUserId: scope.ownerUserId,
    root: scope.root
  },
  turns: [
    {
      input: {
        conversationId,
        turnId: '22222222-2222-4222-8222-222222222222',
        message: 'Question',
        attachmentIds: []
      },
      status: 'completed'
    }
  ],
  events: []
};
test('transcript writes once to the caller private folder with exact readback', async () => {
  const files = new Map();
  let writes = 0;
  const client = {
    principal: async () => scope.principalId,
    file: async (/** @type {string} */ p) => (files.has(p) ? { text: files.get(p) } : null),
    write: async (/** @type {string} */ p, /** @type {string} */ t) => {
      writes++;
      files.set(p, t);
    }
  };
  const archive = await chatTranscriptArchive(
    await mkdtemp(join(tmpdir(), 'archive-')),
    () => client
  );
  expect(await archive(record, { token: 'current-caller', scope, conversationId })).toMatchObject({
    state: 'confirmed'
  });
  expect(await archive(record, { token: 'current-caller', scope, conversationId })).toMatchObject({
    state: 'confirmed'
  });
  expect(writes).toBe(1);
  expect([...files.keys()][0]).toMatch(/^\/home-twin-chat\/example\/conversations\//);
  expect(JSON.stringify([...files.values()])).not.toContain('current-caller');
});
test('uncertain write does not upload again; later exact original readback reconciles it', async () => {
  const files = new Map();
  let writes = 0;
  const client = {
    principal: async () => scope.principalId,
    file: async (/** @type {string} */ p) => (files.has(p) ? { text: files.get(p) } : null),
    write: async () => {
      writes++;
      throw Error('timeout');
    }
  };
  const archive = await chatTranscriptArchive(
    await mkdtemp(join(tmpdir(), 'archive-')),
    () => client
  );
  const access = { token: 'current-caller', scope, conversationId };
  const first = await archive(record, access);
  expect(first.state).toBe('unconfirmed');
  expect((await archive(record, access)).state).toBe('unconfirmed');
  expect(writes).toBe(1);
  files.set(first.path, JSON.stringify(record));
  expect((await archive(record, access)).state).toBe('confirmed');
  expect(writes).toBe(1);
});
test('source text requires exact accepted checksum and caller scoped source location', async () => {
  const bytes = Buffer.from('Synthetic equipment note');
  const source = {
    id: 'note',
    title: 'Note',
    contributionId: '55555555-5555-4555-8555-555555555555',
    sourceUserId: scope.principalId,
    attachment: {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
      mimeType: 'text/plain',
      extension: 'txt',
      originalName: 'note.txt'
    }
  };
  let downloads = 0;
  const reader = chatSourceReader(() => ({
    fileBytes: async () => {
      downloads++;
      return { bytes };
    }
  }));
  const access = {
    token: 'current-caller',
    scope,
    userId: scope.principalId,
    ownerUserId: scope.ownerUserId,
    root: scope.root,
    home: { members: [] }
  };
  expect(await reader(source, access)).toMatchObject({
    text: 'Synthetic equipment note',
    originalAvailable: true
  });
  await expect(
    reader({ ...source, attachment: { ...source.attachment, sha256: 'a'.repeat(64) } }, access)
  ).rejects.toThrow(/checksum/i);
  await expect(
    reader({ ...source, sourceUserId: '44444444-4444-4444-8444-444444444444' }, access)
  ).rejects.toThrow(/revoked|unavailable/i);
  expect(downloads).toBe(2);
});
