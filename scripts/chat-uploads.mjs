import { mkdir, lstat, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  validateChatUpload,
  chatUploadId,
  CHAT_UPLOAD_CHUNK_BYTES,
  CHAT_UPLOAD_MAX_BYTES
} from '../src/lib/home/chat-upload-contract.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { SOURCE_TYPES } from '../src/lib/home/attachments.js';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { withChatLock } from './chat-lock.mjs';
let finalizing = 0;
const scopeKey = (/** @type {any} */ s, /** @type {string} */ id) =>
  s.homeId + '/' + s.principalId + '/' + id;
const sha = (/** @type {Uint8Array|string} */ bytes) =>
  createHash('sha256').update(bytes).digest('hex');
/** Private resumable original storage. IO and authority bind the same caller;
 * pending writes are only reconciled, never silently issued again.
 * @param {any} options */
export async function createChatUploads({
  directory,
  authorize,
  ioFor,
  secretsFor = () => [],
  maxStoredBytes = 2 * 1024 * 1024 * 1024
}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const st = await lstat(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
    throw Error('Private upload directory required');
  async function access(/** @type {any} */ request) {
    if (
      !request ||
      Object.keys(request).some((k) => !['token', 'homeId'].includes(k)) ||
      typeof request.token !== 'string' ||
      request.token.length < 8
    )
      throw Error('Current upload caller required');
    const value = await authorize(request),
      scope = validateChatScope(value.scope);
    if (scope.homeId !== request.homeId || !['maintainer', 'contributor'].includes(scope.role))
      throw Error('Upload role is read-only or unavailable');
    return { ...value, scope, token: request.token };
  }
  function binding(/** @type {any} */ scope) {
    return {
      homeId: scope.homeId,
      principalId: scope.principalId,
      ownerUserId: scope.ownerUserId,
      root: scope.root
    };
  }
  function credentials(/** @type {any} */ current, /** @type {any} */ request) {
    return [request.token, ...secretsFor(current.scope)].filter(
      (s) => typeof s === 'string' && s.length >= 8
    );
  }
  function rejectSecrets(/** @type {Uint8Array|string} */ bytes, /** @type {string[]} */ secrets) {
    const raw = Buffer.from(bytes);
    if (secrets.some((secret) => raw.includes(Buffer.from(secret))))
      throw Error('Credentials cannot be stored as a home source');
  }
  async function folder(/** @type {any} */ scope, /** @type {string} */ id) {
    const dir = join(directory, scope.homeId, scope.principalId, chatUploadId(id));
    for (const part of [
      join(directory, scope.homeId),
      join(directory, scope.homeId, scope.principalId),
      dir
    ]) {
      await mkdir(part, { recursive: true, mode: 0o700 });
      const s = await lstat(part);
      if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
        throw Error('Private source job required');
    }
    return dir;
  }
  async function save(/** @type {string} */ path, /** @type {any} */ value) {
    const temp = path + '.' + randomUUID();
    const f = await open(temp, 'wx', 0o600);
    try {
      await f.writeFile(JSON.stringify(value));
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(temp, path);
  }
  async function load(/** @type {string} */ dir, /** @type {any} */ scope) {
    const path = join(dir, 'manifest.json'),
      s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 32000)
      throw Error('Private upload manifest required');
    const job = JSON.parse(await readFile(path, 'utf8'));
    if (
      job.schema !== 1 ||
      canonicalJSON(job.binding) !== canonicalJSON(binding(scope)) ||
      canonicalJSON(
        validateChatUpload(
          Object.fromEntries(Object.entries(job.input).filter(([k]) => k !== 'chunkCount'))
        )
      ) !== canonicalJSON(job.input)
    )
      throw Error('Upload scope or immutable intent changed');
    return job;
  }
  function result(/** @type {any} */ job) {
    return {
      status:
        job.metadata?.state === 'confirmed'
          ? 'saved'
          : job.original?.state === 'pending' || job.metadata?.state === 'pending'
            ? 'pending-readback'
            : 'uploading',
      uploadId: job.input.uploadId,
      chunkCount: job.input.chunkCount,
      received: job.received,
      sourceId: job.metadata?.state === 'confirmed' ? 'evidence-' + job.input.uploadId : null
    };
  }
  /** @param {Uint8Array} bytes @param {string} mime */
  function type(bytes, mime) {
    const b = Buffer.from(bytes.subarray(0, 12));
    const valid =
      mime === 'application/pdf'
        ? b.toString('ascii', 0, 5) === '%PDF-'
        : mime === 'image/png'
          ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mime === 'image/jpeg'
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : mime === 'image/webp'
              ? b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
              : mime === 'text/plain';
    if (!valid) throw Error('Original format differs');
    if (mime === 'text/plain') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw Error('Original note is not UTF-8 text');
    }
  }
  return {
    /** Re-read exact confirmed originals with this caller, never another account's draft.
     * @param {string} sourceId @param {any} request */ async source(sourceId, request) {
      if (typeof sourceId !== 'string' || !sourceId.startsWith('evidence-')) return null;
      const id = chatUploadId(sourceId.slice(9)),
        current = await access(request);
      let job;
      try {
        job = await load(await folder(current.scope, id), current.scope);
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
        throw e;
      }
      if (job.metadata?.state !== 'confirmed' || job.original?.state !== 'confirmed')
        throw Error('Source is awaiting confirmation');
      const io = ioFor(current),
        metadata = await io.read(job.metadata.path),
        bytes = await io.read(job.original.path);
      if (!metadata || !bytes || sha(bytes) !== job.input.sha256)
        throw Error('Confirmed original unavailable or changed');
      const record = JSON.parse(Buffer.from(metadata).toString('utf8'));
      const expected = {
        id,
        homeId: current.scope.homeId,
        kind: 'evidence',
        value: job.input.title,
        attachment: {
          sha256: job.input.sha256,
          sizeBytes: job.input.sizeBytes,
          mimeType: job.input.mimeType,
          extension: SOURCE_TYPES[job.input.mimeType],
          originalName: job.input.originalName
        },
        authorUserId: current.scope.principalId,
        recordedAt: job.recordedAt
      };
      if (!Buffer.from(metadata).equals(Buffer.from(JSON.stringify(expected))))
        throw Error('Original metadata changed');
      return {
        source: {
          id: sourceId,
          title: job.input.title,
          attachment: record.attachment,
          sourceUserId: current.scope.principalId,
          contributionId: id
        },
        bytes
      };
    },
    /** @param {any} input @param {any} request */ async prepare(input, request) {
      const current = await access(request),
        value = validateChatUpload(input);
      rejectSecrets(JSON.stringify(value), credentials(current, request));
      const dir = await folder(current.scope, value.uploadId),
        path = join(dir, 'manifest.json');
      return withChatLock(path, async () => {
        let job;
        try {
          job = await load(dir, current.scope);
          if (canonicalJSON(job.input) !== canonicalJSON(value))
            throw Error('Changed upload intent');
        } catch (e) {
          if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ENOENT') throw e;
          await withChatLock(join(directory, 'capacity.json'), async () => {
            const capacityPath = join(directory, 'capacity.json');
            let capacity = { jobs: /** @type {any[]} */ ([]) };
            try {
              const s = await lstat(capacityPath);
              if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 2 * 1024 * 1024)
                throw Error('Private source capacity required');
              capacity = JSON.parse(await readFile(capacityPath, 'utf8'));
            } catch (e) {
              if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ENOENT') throw e;
            }
            if (
              !Array.isArray(capacity.jobs) ||
              capacity.jobs.length > 10000 ||
              capacity.jobs.some(
                (j) => !Number.isSafeInteger(j.size) || j.size < 1 || typeof j.key !== 'string'
              )
            )
              throw Error('Source capacity unknown');
            const key = scopeKey(current.scope, value.uploadId),
              prior = capacity.jobs.find((j) => j.key === key);
            if (prior) {
              if (prior.size !== value.sizeBytes || prior.sha256 !== value.sha256)
                throw Error('Changed source capacity intent');
              return;
            }
            if (
              capacity.jobs.reduce((sum, j) => sum + j.size, 0) + value.sizeBytes >
              maxStoredBytes
            )
              throw Error('Private source capacity reached; existing originals are retained');
            capacity.jobs.push({ key, size: value.sizeBytes, sha256: value.sha256 });
            await save(capacityPath, capacity);
          });
          job = {
            schema: 1,
            binding: binding(current.scope),
            input: value,
            recordedAt: new Date().toISOString(),
            received: [],
            chunkHashes: {}
          };
          await save(path, job);
        }
        return result(job);
      });
    },
    /** @param {any} input @param {any} request */ async status(input, request) {
      const current = await access(request);
      if (!input || Object.keys(input).length !== 1) throw Error('Invalid upload fields');
      return result(await load(await folder(current.scope, input.uploadId), current.scope));
    },
    /** @param {any} input @param {any} request */ async chunk(input, request) {
      const current = await access(request);
      if (
        !input ||
        Object.keys(input).length !== 3 ||
        Object.keys(input).some((k) => !['uploadId', 'index', 'base64'].includes(k)) ||
        !Number.isSafeInteger(input.index) ||
        typeof input.base64 !== 'string' ||
        input.base64.length > 4 * 1024 * 1024 + 4 ||
        input.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
      )
        throw Error('Invalid bounded source chunk');
      const dir = await folder(current.scope, input.uploadId),
        path = join(dir, 'manifest.json');
      return withChatLock(path, async () => {
        const job = await load(dir, current.scope);
        if (input.index < 0 || input.index >= job.input.chunkCount)
          throw Error('Upload chunk unavailable');
        const bytes = Buffer.from(input.base64, 'base64'),
          expected = Math.min(
            CHAT_UPLOAD_CHUNK_BYTES,
            job.input.sizeBytes - input.index * CHAT_UPLOAD_CHUNK_BYTES
          );
        if (bytes.length !== expected) throw Error('Source chunk length differs');
        const secrets = credentials(current, request);
        rejectSecrets(bytes, secrets);
        for (const secret of secrets) {
          const neighbors = [];
          for (const index of [input.index - 1, input.index + 1]) {
            try {
              const p = join(dir, String(index) + '.bin'),
                s = await lstat(p);
              if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077)
                throw Error('Private source chunk required');
              const b = await readFile(p);
              neighbors.push(
                index < input.index
                  ? b.subarray(Math.max(0, b.length - secret.length + 1))
                  : b.subarray(0, secret.length - 1)
              );
            } catch (e) {
              if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ENOENT') throw e;
              neighbors.push(Buffer.alloc(0));
            }
          }
          rejectSecrets(Buffer.concat([neighbors[0], bytes, neighbors[1]]), [secret]);
        }
        const chunkPath = join(dir, String(input.index) + '.bin'),
          digest = sha(bytes);
        if (job.received.includes(input.index)) {
          if (job.chunkHashes[input.index] !== digest)
            throw Error('Changed source chunk collision');
          return result(job);
        }
        try {
          const st = await lstat(chunkPath);
          if (
            !st.isFile() ||
            st.isSymbolicLink() ||
            st.mode & 0o077 ||
            sha(await readFile(chunkPath)) !== digest
          )
            throw Error('Changed source chunk collision');
        } catch (e) {
          if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ENOENT') throw e;
          const file = await open(chunkPath, 'wx', 0o600);
          try {
            await file.writeFile(bytes);
            await file.sync();
          } finally {
            await file.close();
          }
        }
        job.received.push(input.index);
        job.received.sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
        job.chunkHashes[input.index] = digest;
        await save(path, job);
        return result(job);
      });
    },
    /** @param {any} input @param {any} request */ async finish(input, request) {
      let current = await access(request);
      if (!input || Object.keys(input).length !== 1) throw Error('Invalid upload fields');
      const dir = await folder(current.scope, input.uploadId),
        path = join(dir, 'manifest.json');
      return withChatLock(path, async () => {
        if (finalizing) throw Error('Another original is being confirmed; retry this same file');
        finalizing++;
        try {
          const job = await load(dir, current.scope);
          if (job.received.length !== job.input.chunkCount)
            throw Error('Original source chunks incomplete');
          const parts = [];
          for (let i = 0; i < job.input.chunkCount; i++) {
            const chunkPath = join(dir, String(i) + '.bin'),
              s = await lstat(chunkPath);
            if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077)
              throw Error('Private source chunk required');
            const part = await readFile(chunkPath);
            if (sha(part) !== job.chunkHashes[i]) throw Error('Stored source chunk changed');
            parts.push(part);
          }
          const bytes = Buffer.concat(parts);
          if (
            bytes.length !== job.input.sizeBytes ||
            bytes.length > CHAT_UPLOAD_MAX_BYTES ||
            sha(bytes) !== job.input.sha256
          )
            throw Error('Original source checksum differs');
          type(bytes, job.input.mimeType);
          for (const secret of [request.token, ...secretsFor(current.scope)])
            if (
              typeof secret === 'string' &&
              secret.length >= 8 &&
              bytes.includes(Buffer.from(secret))
            )
              throw Error('Credentials cannot be stored as a home source');
          current = await access(request);
          if (canonicalJSON(binding(current.scope)) !== canonicalJSON(job.binding))
            throw Error('Source scope changed');
          const io = ioFor(current),
            attachment = {
              sha256: job.input.sha256,
              sizeBytes: bytes.length,
              mimeType: job.input.mimeType,
              extension: SOURCE_TYPES[job.input.mimeType],
              originalName: job.input.originalName
            },
            originalPath =
              current.scope.root +
              '/sources/' +
              job.input.uploadId +
              '-' +
              attachment.sha256 +
              '.' +
              attachment.extension;
          const original = await io.read(originalPath);
          if (original) {
            if (sha(original) !== attachment.sha256) throw Error('Original readback differs');
            job.original = { state: 'confirmed', path: originalPath };
            await save(path, job);
          } else if (job.original?.state === 'confirmed')
            throw Error('Confirmed original is unavailable');
          else if (job.original?.state === 'pending') return result(job);
          else {
            job.original = { state: 'intent', path: originalPath };
            await save(path, job);
            current = await access(request);
            if (canonicalJSON(binding(current.scope)) !== canonicalJSON(job.binding))
              throw Error('Source scope changed');
            job.original.state = 'pending';
            await save(path, job);
            try {
              await io.write(originalPath, bytes, attachment.mimeType, async () => {
                const fresh = await access(request);
                if (canonicalJSON(binding(fresh.scope)) !== canonicalJSON(job.binding))
                  throw Error('Source scope changed');
              });
            } catch {}
            const after = await io.read(originalPath);
            if (!after) return result(job);
            if (sha(after) !== attachment.sha256) throw Error('Original readback differs');
            job.original.state = 'confirmed';
            await save(path, job);
          }
          const record = {
            id: job.input.uploadId,
            homeId: current.scope.homeId,
            kind: 'evidence',
            value: job.input.title,
            attachment,
            authorUserId: current.scope.principalId,
            recordedAt: job.recordedAt
          };
          const metaPath =
              current.scope.root +
              '/contributions/' +
              job.input.uploadId +
              '-' +
              sha(
                canonicalJSON({
                  id: record.id,
                  homeId: record.homeId,
                  kind: record.kind,
                  value: record.value,
                  attachment
                })
              ) +
              '.json',
            encoded = Buffer.from(JSON.stringify(record));
          const meta = await io.read(metaPath);
          if (meta) {
            if (!Buffer.from(meta).equals(encoded)) throw Error('Source metadata collision');
            job.metadata = { state: 'confirmed', path: metaPath };
            await save(path, job);
          } else if (job.metadata?.state === 'confirmed')
            throw Error('Confirmed source metadata is unavailable');
          else if (job.metadata?.state === 'pending') return result(job);
          else {
            job.metadata = { state: 'intent', path: metaPath };
            await save(path, job);
            current = await access(request);
            if (canonicalJSON(binding(current.scope)) !== canonicalJSON(job.binding))
              throw Error('Source scope changed');
            job.metadata.state = 'pending';
            await save(path, job);
            try {
              await io.write(metaPath, encoded, 'application/json', async () => {
                const fresh = await access(request);
                if (canonicalJSON(binding(fresh.scope)) !== canonicalJSON(job.binding))
                  throw Error('Source scope changed');
              });
            } catch {}
            const after = await io.read(metaPath);
            if (after) {
              if (!Buffer.from(after).equals(encoded))
                throw Error('Source metadata readback differs');
              job.metadata.state = 'confirmed';
              await save(path, job);
            }
          }
          return result(job);
        } finally {
          finalizing--;
        }
      });
    }
  };
}
