import { SOURCE_TYPES, MAX_ATTACHMENT_BYTES } from './attachments.js';
export const CHAT_UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;
export const CHAT_UPLOAD_MAX_BYTES = MAX_ATTACHMENT_BYTES;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Portable immutable upload metadata, never a caller or filesystem path.
 * @param {any} input */
export function validateChatUpload(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !['uploadId', 'title', 'originalName', 'mimeType', 'sizeBytes', 'sha256'].includes(k)
    )
  )
    throw Error('Unsupported upload fields or authority');
  if (
    typeof input.uploadId !== 'string' ||
    !uuid.test(input.uploadId) ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 500 ||
    typeof input.originalName !== 'string' ||
    !input.originalName ||
    input.originalName.length > 200 ||
    /[\0\r\n]/.test(input.originalName) ||
    typeof input.mimeType !== 'string' ||
    !Object.hasOwn(SOURCE_TYPES, input.mimeType) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > CHAT_UPLOAD_MAX_BYTES ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256)
  )
    throw Error('Invalid supported upload metadata');
  return {
    uploadId: input.uploadId.toLowerCase(),
    title: input.title.trim(),
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    chunkCount: Math.ceil(input.sizeBytes / CHAT_UPLOAD_CHUNK_BYTES)
  };
}
/** @param {any} input */ export function chatUploadId(input) {
  if (typeof input !== 'string' || !uuid.test(input))
    throw Error('Stable upload identifier required');
  return input.toLowerCase();
}
