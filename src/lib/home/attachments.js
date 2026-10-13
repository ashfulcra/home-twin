export const MAX_SOURCE_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;
/** @type {Record<string,string>} */
export const SOURCE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt'
};
/** @param {any} a */
export function validAttachment(a) {
  return (
    !!a &&
    typeof a === 'object' &&
    /^[0-9a-f]{64}$/.test(a.sha256) &&
    Number.isSafeInteger(a.sizeBytes) &&
    a.sizeBytes > 0 &&
    a.sizeBytes <= MAX_ATTACHMENT_BYTES &&
    typeof a.mimeType === 'string' &&
    Object.hasOwn(SOURCE_TYPES, a.mimeType) &&
    SOURCE_TYPES[a.mimeType] === a.extension &&
    typeof a.originalName === 'string' &&
    a.originalName.length <= 200
  );
}
/** Paths are derived from validated identifiers, never supplied by the uploader.
 * @param {string} root @param {string} id @param {any} a */
export function attachmentPath(root, id, a) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    !validAttachment(a)
  )
    throw new Error('Invalid source metadata');
  return `${root}/sources/${id}-${a.sha256}.${a.extension}`;
}
