import { CHAT_UPLOAD_MAX_BYTES } from '../src/lib/home/chat-upload-contract.js';
/** Own-account source/contribution IO, never arbitrary vault access or CLI auth.
 * @param {string} token @param {{root:string,principalId:string}} scope @param {typeof fetch} [send] */
export function chatFileClient(token, scope, send = fetch) {
  if (typeof token !== 'string' || token.length < 8) throw Error('Current caller required');
  const endpoint = 'https://api.fulcradynamics.com/';
  const allowed = (/** @type {string} */ p) =>
    typeof p === 'string' &&
    (p.startsWith(scope.root + '/sources/') || p.startsWith(scope.root + '/contributions/')) &&
    !p.includes('\\') &&
    !p.includes('\0') &&
    !p.split('/').some((s) => s === '.' || s === '..') &&
    !p.includes('//');
  async function api(/** @type {string} */ path, /** @type {any} */ body = undefined) {
    const r = await send(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw Error('File operation unavailable');
    return r;
  }
  return {
    async read(/** @type {string} */ path) {
      if (!allowed(path)) throw Error('Source scope differs');
      const split = path.lastIndexOf('/');
      const listing = await (
        await api(
          'input/v1/file_upload?state=uploaded&path=' +
            encodeURIComponent(path.slice(0, split)) +
            '&fulcra_userid=' +
            encodeURIComponent(scope.principalId)
        )
      ).json();
      if (!Array.isArray(listing.files) || listing.files.length > 5000)
        throw Error('Source discovery incomplete');
      const files = listing.files.filter(
        (/** @type {any} */ f) => f.name === path.slice(split + 1)
      );
      if (!files.length) return null;
      if (files.length !== 1 || typeof files[0].id !== 'string')
        throw Error('Source metadata ambiguous');
      const r = await api(
        'input/v1/file_upload/' +
          encodeURIComponent(files[0].id) +
          '/download?fulcra_userid=' +
          encodeURIComponent(scope.principalId)
      );
      if (!r.body || Number(r.headers.get('Content-Length') ?? 0) > CHAT_UPLOAD_MAX_BYTES)
        throw Error('Original exceeds bound');
      const reader = r.body.getReader(),
        parts = [];
      let total = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.length;
          if (total > CHAT_UPLOAD_MAX_BYTES) {
            await reader.cancel();
            throw Error('Original exceeds bound');
          }
          parts.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(parts);
    },
    async write(
      /** @type {string} */ path,
      /** @type {Uint8Array} */ bytes,
      /** @type {string} */ mime,
      /** @type {()=>Promise<void>} */ beforeCommit = async () => {}
    ) {
      if (
        !allowed(path) ||
        !bytes.length ||
        bytes.length > CHAT_UPLOAD_MAX_BYTES ||
        ![
          'image/png',
          'image/jpeg',
          'image/webp',
          'application/pdf',
          'text/plain',
          'application/json'
        ].includes(mime)
      )
        throw Error('Source scope or bound differs');
      const split = path.lastIndexOf('/');
      const upload = await (
        await api('input/v1/file_upload', {
          path: path.slice(0, split),
          name: path.slice(split + 1),
          content_type: mime,
          content_length: bytes.length
        })
      ).json();
      const url = new URL(upload.url);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw Error('Secure source upload required');
      await beforeCommit();
      const r = await send(url, {
        method: 'POST',
        headers: { 'Content-Type': mime, 'Content-Length': String(bytes.length) },
        body: Buffer.from(bytes),
        signal: AbortSignal.timeout(120000)
      });
      if (!r.ok) throw Error('Source write unconfirmed');
    }
  };
}
