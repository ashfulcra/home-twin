import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createChatUploads } from '../../../scripts/chat-uploads.mjs';
const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  },
  bytes = Buffer.from('Synthetic heating label: H200'),
  input = {
    uploadId: '11111111-1111-4111-8111-111111111111',
    title: 'Synthetic label',
    originalName: 'label.txt',
    mimeType: 'text/plain',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
test('stable uploaded chunks survive restart and original writes only once after exact readback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chat-upload-')),
    files = new Map();
  let writes = 0;
  const io = {
    read: async (/** @type {string} */ p) => files.get(p) ?? null,
    write: async (/** @type {string} */ p, /** @type {Uint8Array} */ b) => {
      writes++;
      files.set(p, Buffer.from(b));
    }
  };
  let uploads = await createChatUploads({
    directory: dir,
    authorize: async () => ({ scope, home: { id: 'example', equipment: [] } }),
    ioFor: () => io
  });
  await uploads.prepare(input, { token: 'synthetic-caller', homeId: 'example' });
  await uploads.chunk(
    { uploadId: input.uploadId, index: 0, base64: bytes.toString('base64') },
    { token: 'synthetic-caller', homeId: 'example' }
  );
  uploads = await createChatUploads({
    directory: dir,
    authorize: async () => ({ scope, home: { id: 'example', equipment: [] } }),
    ioFor: () => io
  });
  expect(
    await uploads.finish(
      { uploadId: input.uploadId },
      { token: 'synthetic-caller', homeId: 'example' }
    )
  ).toMatchObject({ status: 'saved', sourceId: 'evidence-' + input.uploadId });
  const count = writes;
  expect(
    await uploads.finish(
      { uploadId: input.uploadId },
      { token: 'synthetic-caller', homeId: 'example' }
    )
  ).toMatchObject({ status: 'saved' });
  expect(writes).toBe(count);
  expect([...files.values()].some((b) => Buffer.compare(b, bytes) === 0)).toBe(true);
  expect(
    await uploads.source('evidence-' + input.uploadId, {
      token: 'synthetic-caller',
      homeId: 'example'
    })
  ).toMatchObject({ source: { id: 'evidence-' + input.uploadId, title: input.title }, bytes });
});
test('viewers, changed stable metadata and chunk collisions cannot create originals', async () => {
  let role = 'viewer',
    writes = 0;
  const uploads = await createChatUploads({
    directory: await mkdtemp(join(tmpdir(), 'chat-upload-')),
    authorize: async () => ({ scope: { ...scope, role }, home: { id: 'example', equipment: [] } }),
    ioFor: () => ({
      read: async () => null,
      write: async () => {
        writes++;
      }
    })
  });
  const access = { token: 'synthetic-caller', homeId: 'example' };
  await expect(uploads.prepare(input, access)).rejects.toThrow(/read-only|role/i);
  role = 'maintainer';
  await uploads.prepare(input, access);
  await expect(uploads.prepare({ ...input, title: 'Different' }, access)).rejects.toThrow(
    /intent|changed/i
  );
  await uploads.chunk(
    { uploadId: input.uploadId, index: 0, base64: bytes.toString('base64') },
    access
  );
  await expect(
    uploads.chunk(
      { uploadId: input.uploadId, index: 0, base64: Buffer.alloc(bytes.length).toString('base64') },
      access
    )
  ).rejects.toThrow(/changed|collision/i);
  expect(writes).toBe(0);
});
test('a timeout after cloud write remains uncertain and never silently uploads again', async () => {
  let writes = 0;
  const io = {
    read: async () => null,
    write: async () => {
      writes++;
      throw Error('timeout');
    }
  };
  const uploads = await createChatUploads({
    directory: await mkdtemp(join(tmpdir(), 'chat-upload-')),
    authorize: async () => ({ scope, home: { id: 'example', equipment: [] } }),
    ioFor: () => io
  });
  const access = { token: 'synthetic-caller', homeId: 'example' };
  await uploads.prepare(input, access);
  await uploads.chunk(
    { uploadId: input.uploadId, index: 0, base64: bytes.toString('base64') },
    access
  );
  expect(await uploads.finish({ uploadId: input.uploadId }, access)).toMatchObject({
    status: 'pending-readback'
  });
  expect(await uploads.finish({ uploadId: input.uploadId }, access)).toMatchObject({
    status: 'pending-readback'
  });
  expect(writes).toBe(1);
});
test('full-size bounded chunk does not overflow base64 validation and checksum mismatch prevents writes', async () => {
  let writes = 0;
  const big = Buffer.alloc(3 * 1024 * 1024, 65);
  const uploads = await createChatUploads({
    directory: await mkdtemp(join(tmpdir(), 'chat-upload-')),
    authorize: async () => ({ scope, home: { id: 'example', equipment: [] } }),
    ioFor: () => ({
      read: async () => null,
      write: async () => {
        writes++;
      }
    })
  });
  const access = { token: 'synthetic-caller', homeId: 'example' };
  await uploads.prepare({ ...input, sizeBytes: big.length }, access);
  await uploads.chunk(
    { uploadId: input.uploadId, index: 0, base64: big.toString('base64') },
    access
  );
  await expect(uploads.finish({ uploadId: input.uploadId }, access)).rejects.toThrow(/checksum/i);
  expect(writes).toBe(0);
});
test('revocation after original lookup blocks the ensuing original write', async () => {
  let revoked = false,
    writes = 0;
  const uploads = await createChatUploads({
    directory: await mkdtemp(join(tmpdir(), 'chat-upload-')),
    authorize: async () => ({
      scope: { ...scope, role: revoked ? 'viewer' : 'maintainer' },
      home: { id: 'example', equipment: [] }
    }),
    ioFor: () => ({
      read: async () => {
        revoked = true;
        return null;
      },
      write: async () => {
        writes++;
      }
    })
  });
  const access = { token: 'synthetic-caller', homeId: 'example' };
  await uploads.prepare(input, access);
  await uploads.chunk(
    { uploadId: input.uploadId, index: 0, base64: bytes.toString('base64') },
    access
  );
  await expect(uploads.finish({ uploadId: input.uploadId }, access)).rejects.toThrow(
    /read-only|role/i
  );
  expect(writes).toBe(0);
});
test('private upload quota prevents another job before disk allocation', async () => {
  const uploads = await createChatUploads({
    directory: await mkdtemp(join(tmpdir(), 'chat-quota-')),
    authorize: async () => ({ scope }),
    ioFor: () => ({}),
    maxStoredBytes: bytes.length
  });
  const request = { token: 'synthetic-caller', homeId: 'example' };
  await uploads.prepare(input, request);
  await expect(
    uploads.prepare({ ...input, uploadId: '22222222-2222-4222-8222-222222222222' }, request)
  ).rejects.toThrow(/capacity/i);
  expect(await uploads.prepare(input, request)).toMatchObject({ uploadId: input.uploadId });
});
