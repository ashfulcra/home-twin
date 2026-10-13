import { validateChatUpload, CHAT_UPLOAD_CHUNK_BYTES } from './chat-upload-contract.js';
/** Browser upload, stable intent, no file bytes or text saved in browser storage.
 * @param {File} file @param {any} intent @param {any} request @param {(percent:number)=>void} progress @param {AbortSignal} [signal] */
export async function uploadChatFile(file, intent, request, progress, signal) {
  const value = validateChatUpload(intent);
  if (
    file.size !== value.sizeBytes ||
    file.name !== value.originalName ||
    file.type !== value.mimeType
  )
    throw Error('Select the same original to resume');
  signal?.throwIfAborted();
  const state = await request('prepare', intent);
  let count = 0;
  for (let i = 0; i < value.chunkCount; i++) {
    signal?.throwIfAborted();
    if (!state.received.includes(i)) {
      const bytes = new Uint8Array(
        await file
          .slice(i * CHAT_UPLOAD_CHUNK_BYTES, (i + 1) * CHAT_UPLOAD_CHUNK_BYTES)
          .arrayBuffer()
      );
      let binary = '';
      for (let j = 0; j < bytes.length; j += 32768)
        binary += String.fromCharCode(...bytes.subarray(j, j + 32768));
      signal?.throwIfAborted();
      await request('chunk', { uploadId: value.uploadId, index: i, base64: btoa(binary) });
    }
    count++;
    progress(Math.floor((count / value.chunkCount) * 95));
  }
  signal?.throwIfAborted();
  const result = await request('finish', { uploadId: value.uploadId });
  if (result.status === 'saved') progress(100);
  return result;
}
