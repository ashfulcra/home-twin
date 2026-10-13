import { test, expect } from 'vitest';
import { validateChatUpload, CHAT_UPLOAD_CHUNK_BYTES } from './chat-upload-contract.js';
const input = {
  uploadId: '11111111-1111-4111-8111-111111111111',
  title: 'Synthetic plan',
  originalName: 'plan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 178 * 1024 * 1024,
  sha256: 'a'.repeat(64)
};
test('large original is represented by bounded chunks without client authority or paths', () => {
  const value = validateChatUpload(input);
  expect(value.chunkCount).toBe(Math.ceil(input.sizeBytes / CHAT_UPLOAD_CHUNK_BYTES));
  expect(value.sizeBytes).toBe(input.sizeBytes);
  for (const extra of [{ root: '/Other' }, { authorUserId: 'other' }, { path: '../key.txt' }])
    expect(() => validateChatUpload({ ...input, ...extra })).toThrow(/fields|authority/i);
});
test('unsupported metadata and oversized or empty originals fail before upload reservation', () => {
  for (const patch of [
    { sizeBytes: 0 },
    { sizeBytes: 201 * 1024 * 1024 },
    { sha256: 'wrong' },
    { originalName: 'bad\0.pdf' },
    { mimeType: 'application/javascript' },
    { title: '' }
  ])
    expect(() => validateChatUpload({ ...input, ...patch })).toThrow();
});
