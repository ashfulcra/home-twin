import { mkdir, lstat, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { accessFulcraClient } from './access-fulcra-client.mjs';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { sourceLocation } from '../src/lib/server/source-location.js';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Read only an existing source from fresh current home evidence. @param {any} [clientFor] */
export function chatSourceReader(clientFor = accessFulcraClient) {
  return async (/** @type {any} */ source, /** @type {any} */ access) => {
    const location = sourceLocation(access, source),
      attachment = source.attachment;
    const mime =
      attachment?.mimeType ??
      source.mimeType ??
      (/\.(txt|md|json|csv)$/i.test(location.path) ? 'text/plain' : null);
    const expected = attachment?.sha256 ?? source.sha256;
    if (mime !== 'text/plain')
      return {
        id: source.id,
        title: source.title,
        originalAvailable: false,
        note: 'This original needs the file-processing stage.'
      };
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
      return {
        id: source.id,
        title: source.title,
        originalAvailable: false,
        note: 'Accepted original checksum is unavailable; keep this source for review.'
      };
    const file = await clientFor(access.token).fileBytes(location.path, location.userId, 262144);
    if (!file) throw Error('Original source unavailable');
    if (createHash('sha256').update(file.bytes).digest('hex') !== expected)
      throw Error('Original source checksum differs; source review required');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    if (text.includes('\0')) throw Error('Source is not text');
    // Bounded extracted text is evidence; the accepted original checksum is retained.
    return {
      id: source.id,
      title: source.title,
      sha256: expected,
      originalAvailable: true,
      text: text.slice(0, 16000),
      excerpt: text.length > 16000
    };
  };
}
/** Immutable upload intent and exact readback in this caller's own account.
 * An uncertain upload may be reconciled but never blindly issued again.
 * @param {string} directory @param {any} [clientFor] */
export async function chatTranscriptArchive(directory, clientFor = accessFulcraClient) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const st = await lstat(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
    throw Error('Private archive directory required');
  const localPath = (/** @type {any} */ access) => {
    const scope = validateChatScope(access.scope);
    if (!UUID.test(access.conversationId)) throw Error('Invalid conversation');
    return join(
      directory,
      createHash('sha256')
        .update(JSON.stringify([scope.homeId, scope.principalId, access.conversationId]))
        .digest('hex') + '.json'
    );
  };
  async function read(/** @type {string} */ path) {
    try {
      const st = await lstat(path);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 2 * 1024 * 1024 || st.mode & 0o077)
        throw Error('Unsafe archive intent');
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async function save(/** @type {string} */ path, /** @type {any} */ value) {
    const temporary = path + '.' + randomUUID();
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  }
  const archive = async (/** @type {any} */ record, /** @type {any} */ access) => {
    const scope = validateChatScope(access.scope),
      expected = {
        homeId: scope.homeId,
        principalId: scope.principalId,
        ownerUserId: scope.ownerUserId,
        root: scope.root
      };
    if (
      record?.schema !== 1 ||
      JSON.stringify(record.binding) !== JSON.stringify(expected) ||
      record.turns?.some((/** @type {any} */ t) => t.input.conversationId !== access.conversationId)
    )
      throw Error('Transcript scope differs');
    const text = JSON.stringify(record);
    if (Buffer.byteLength(text) > 1024 * 1024 || text.includes(access.token))
      throw Error('Transcript exceeds private limits');
    const path = localPath(access),
      lock = await open(path + '.lock', 'wx', 0o600).catch(() => {
        throw Error('Archive already active');
      });
    try {
      const client = clientFor(access.token);
      if ((await client.principal()) !== scope.principalId) throw Error('Archive caller differs');
      let previous = await read(path);
      if (previous) {
        if (
          JSON.stringify(previous.binding) !== JSON.stringify(expected) ||
          createHash('sha256').update(previous.text).digest('hex') !== previous.sha256
        )
          throw Error('Archive intent differs');
        const remote = await client.file(previous.path, undefined, 1024 * 1024);
        if (remote) {
          if (remote.text !== previous.text) throw Error('Archive readback differs');
          previous.state = 'confirmed';
          await save(path, previous);
        } else if (previous.state === 'confirmed') throw Error('Confirmed transcript unavailable');
        else return { state: 'unconfirmed', path: previous.path };
        if (previous.text === text) return { state: 'confirmed', path: previous.path };
      }
      const sha256 = createHash('sha256').update(text).digest('hex'),
        remotePath =
          '/home-twin-chat/' +
          scope.homeId +
          '/conversations/' +
          access.conversationId +
          '/' +
          sha256 +
          '.json';
      const intent = {
        schema: 1,
        binding: expected,
        path: remotePath,
        text,
        sha256,
        state: 'unconfirmed'
      };
      const already = await client.file(remotePath, undefined, 1024 * 1024);
      if (already) {
        if (already.text !== text) throw Error('Transcript readback differs');
        intent.state = 'confirmed';
        await save(path, intent);
        return { state: 'confirmed', path: remotePath };
      }
      if (access.authorize) {
        const fresh = await access.authorize();
        if (
          fresh.scope.homeId !== scope.homeId ||
          fresh.scope.principalId !== scope.principalId ||
          fresh.scope.ownerUserId !== scope.ownerUserId ||
          fresh.scope.root !== scope.root
        )
          throw Error('Archive scope changed');
      }
      await save(path, intent);
      try {
        await client.write(remotePath, text);
      } catch {
        /* The durable same-intent readback resolves a possibly completed write. */
      }
      try {
        const after = await client.file(remotePath, undefined, 1024 * 1024);
        if (after?.text === text) {
          intent.state = 'confirmed';
          await save(path, intent);
        }
      } catch {
        /* Keep uncertain, never repeat the upload. */
      }
      return { state: intent.state, path: remotePath };
    } finally {
      await lock.close();
      await unlink(path + '.lock');
    }
  };
  archive.status = async (/** @type {any} */ access) => {
    const value = await read(localPath(access));
    return { state: value?.state ?? 'local' };
  };
  return archive;
}
