import { createHash } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { validNoteSources } from '../src/lib/home/contributions.js';
import { sourceLocation } from '../src/lib/server/source-location.js';
import { accessFulcraClient } from './access-fulcra-client.mjs';
/** Hash original bytes only; never treat excerpts, failed access or instructions as verification. @param {any} options */
export function chatActionSourceVerifier({ authorize, uploads, clientFor = accessFulcraClient }) {
  return async (/** @type {string[]} */ ids, /** @type {any} */ access) => {
    if (!validNoteSources(ids) || ids.length > 6) throw Error('Known source IDs required');
    const binding = (/** @type {any} */ a) => {
      const s = validateChatScope(a.scope);
      if (!['maintainer', 'contributor'].includes(s.role))
        throw Error('Current contribution role required');
      return { scope: s, home: a.home, fileVersion: a.fileVersion };
    };
    const request = { token: access.token, homeId: access.scope.homeId },
      start = binding(await authorize(request));
    if (canonicalJSON(start) !== canonicalJSON(binding(access)))
      throw Error('Home changed before original verification');
    const out = [];
    for (const id of ids) {
      const matches = start.home.sources?.filter((/** @type {any} */ s) => s.id === id) ?? [];
      /** @type {any} */ let source, bytes;
      if (matches.length) {
        if (matches.length !== 1) throw Error('Source reference ambiguous');
        source = matches[0];
        const location = sourceLocation(
          {
            ...start,
            userId: start.scope.principalId,
            ownerUserId: start.scope.ownerUserId,
            root: start.scope.root
          },
          source
        );
        const prefix =
          start.scope.root === '/home/twin' && start.scope.principalId === start.scope.ownerUserId
            ? '/home/'
            : start.scope.root + '/sources/';
        if (
          !location.path.startsWith(prefix) ||
          location.path.includes('\\') ||
          location.path.includes('//') ||
          location.path.split('/').some((/** @type {string} */ s) => s === '.' || s === '..')
        )
          throw Error('Original outside authorized home sources');
        const original = await clientFor(access.token).fileBytes(
          location.path,
          location.userId,
          200 * 1024 * 1024
        );
        if (!original) throw Error('Original source unavailable');
        bytes = original.bytes;
      } else {
        const original = uploads ? await uploads.source(id, request) : null;
        if (!original) throw Error('Original source unavailable');
        source = original.source;
        bytes = original.bytes;
      }
      const expected = source.attachment?.sha256 ?? source.sha256,
        sha256 = createHash('sha256').update(bytes).digest('hex');
      if (!/^[a-f0-9]{64}$/.test(expected) || expected !== sha256)
        throw Error('Original checksum changed or unverified');
      out.push({ id, sha256 });
    }
    if (canonicalJSON(binding(await authorize(request))) !== canonicalJSON(start))
      throw Error('Current access changed during original verification');
    return out;
  };
}
