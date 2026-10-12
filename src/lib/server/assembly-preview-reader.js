import { readBoundedBytes } from './fulcra-files.js';
/** Current-caller-only bounded file reader. No write/share or foreign-account selectors.
 * @param {string} endpoint @param {string} token @param {string} root @param {typeof fetch} [send] */
export function assemblyPreviewReader(endpoint, token, root, send = fetch) {
  const deadline = AbortSignal.timeout(25000);
  async function get(/** @type {string} */ path, /** @type {number} */ max) {
    const r = await send(endpoint + path, {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)])
    });
    if (!r.ok) throw Error('Private preview source access status ' + r.status);
    return readBoundedBytes(r, max);
  }
  return {
    read: async (/** @type {string} */ path, /** @type {number} */ max) => {
      if (
        typeof path !== 'string' ||
        !path.startsWith(root + '/') ||
        path.includes('..') ||
        path.includes('\\')
      )
        throw Error('Private preview path scope differs');
      const split = path.lastIndexOf('/'),
        name = path.slice(split + 1);
      const listing = JSON.parse(
        new TextDecoder().decode(
          await get(
            'input/v1/file_upload?path=' + encodeURIComponent(path.slice(0, split)),
            1024 * 1024
          )
        )
      );
      if (!Array.isArray(listing.files) || listing.files.length > 5000)
        throw Error('Private preview metadata unavailable');
      const files = listing.files.filter((/** @type {any} */ f) => f?.name === name);
      if (!files.length) return null;
      if (
        files.length !== 1 ||
        typeof files[0].id !== 'string' ||
        !files[0].id ||
        files[0].id.length > 300
      )
        throw Error('Private preview metadata ambiguous');
      return {
        id: files[0].id,
        bytes: await get(
          'input/v1/file_upload/' + encodeURIComponent(files[0].id) + '/download',
          max
        )
      };
    }
  };
}
