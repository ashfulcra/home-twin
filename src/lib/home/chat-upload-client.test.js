import { test, expect } from 'vitest';
import { uploadChatFile } from './chat-upload-client.js';
test('resuming a selected original sends only missing chunks and retains the same upload ID', async () => {
  const file = new File([new Uint8Array(3 * 1024 * 1024 + 9)], 'plan.pdf', {
    type: 'application/pdf'
  });
  const intent = {
    uploadId: '11111111-1111-4111-8111-111111111111',
    title: 'Plan',
    originalName: 'plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: file.size,
    sha256: 'a'.repeat(64)
  };
  const chunks = /** @type {number[]} */ ([]),
    progress = /** @type {number[]} */ ([]);
  const request = async (/** @type {string} */ action, /** @type {any} */ input) => {
    if (action === 'prepare') return { received: [0] };
    if (action === 'chunk') {
      chunks.push(input.index);
      return { received: [0, input.index] };
    }
    return { status: 'saved', uploadId: input.uploadId, sourceId: 'evidence-' + input.uploadId };
  };
  expect(await uploadChatFile(file, intent, request, (p) => progress.push(p))).toMatchObject({
    status: 'saved'
  });
  expect(chunks).toEqual([1]);
  expect(progress.at(-1)).toBe(100);
});
test('stopping an upload prevents later chunks and finalization', async () => {
  const file = new File(['abc'], 'note.txt', { type: 'text/plain' }),
    controller = new AbortController();
  let finish = false;
  const intent = {
    uploadId: '11111111-1111-4111-8111-111111111111',
    title: 'Note',
    originalName: 'note.txt',
    mimeType: 'text/plain',
    sizeBytes: 3,
    sha256: 'a'.repeat(64)
  };
  await expect(
    uploadChatFile(
      file,
      intent,
      async (/** @type {string} */ action) => {
        controller.abort();
        if (action === 'finish') finish = true;
        return { received: [] };
      },
      () => {},
      controller.signal
    )
  ).rejects.toThrow();
  expect(finish).toBe(false);
});
