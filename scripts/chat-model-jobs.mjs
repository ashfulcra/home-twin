import { mkdir, lstat, readFile, open, link, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { assertExternalState } from './maintainer-journal.mjs';
import { withChatLock } from './chat-lock.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
const same = (/** @type {any} */ a, /** @type {any} */ b) => canonicalJSON(a) === canonicalJSON(b);
const hash = (/** @type {any} */ a) => createHash('sha256').update(canonicalJSON(a)).digest('hex');
const exact = (/** @type {any} */ a, /** @type {string[]} */ keys) =>
  a &&
  typeof a === 'object' &&
  !Array.isArray(a) &&
  Object.keys(a).length === keys.length &&
  Object.keys(a).every((k) => keys.includes(k));
const absent = (/** @type {any} */ e) => e?.code === 'ENOENT';
const binding = (/** @type {any} */ s) => ({
  homeId: s.homeId,
  principalId: s.principalId,
  ownerUserId: s.ownerUserId,
  root: s.root
});
/** Server-only durable human Apply requests. Pending consent is distinct from an audited model approval.
 * No token is persisted, no automatic run on startup, no model tool registration.
 * @param {any} options */
export async function createChatModelJobs({ directory, authorize, reviewsFor, publisherFor }) {
  directory = resolve(directory);
  async function privateDir(/** @type {string} */ p, create = false) {
    try {
      const s = await lstat(p);
      if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
        throw Error('Private model job directory required');
      return true;
    } catch (e) {
      if (!absent(e)) throw e;
      if (!create) return false;
      await mkdir(p, { mode: 0o700 });
      return privateDir(p);
    }
  }
  await privateDir(directory, true);
  assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
  function input(/** @type {any} */ x) {
    if (
      !exact(x, ['conversationId', 'actionId', 'digest']) ||
      !uuid.test(x.conversationId) ||
      !uuid.test(x.actionId) ||
      !hex.test(x.digest)
    )
      throw Error('Exact human model request required');
    return structuredClone(x);
  }
  async function access(/** @type {any} */ request) {
    if (
      !exact(request, ['token', 'homeId']) ||
      typeof request.token !== 'string' ||
      request.token.length < 8 ||
      request.token.length > 16384
    )
      throw Error('Current model caller required');
    const a = await authorize(request),
      scope = validateChatScope(a.scope);
    if (
      scope.homeId !== request.homeId ||
      scope.role !== 'maintainer' ||
      scope.principalId !== scope.ownerUserId
    )
      throw Error('Current designated owner required');
    const reviews = reviewsFor(scope.homeId),
      publisher = publisherFor(scope.homeId);
    if (!reviews || !publisher) throw Error('Model actions unavailable');
    return { scope, reviews, publisher };
  }
  async function paths(/** @type {any} */ s, /** @type {any} */ i, create = false) {
    const home = join(directory, s.homeId),
      actor = join(home, s.principalId),
      conversation = join(actor, i.conversationId);
    for (const p of [directory, home, actor, conversation])
      if (!(await privateDir(p, create))) return null;
    return { home, actor, path: join(conversation, i.actionId + '.json') };
  }
  async function read(/** @type {string} */ p) {
    try {
      const s = await lstat(p);
      if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 4096)
        throw Error('Private bounded model job required');
      const value = JSON.parse(await readFile(p, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Present model journal is corrupt');
      return value;
    } catch (e) {
      if (absent(e)) return null;
      throw e;
    }
  }
  async function promote(/** @type {string} */ p) {
    const f = await open(p + '.tmp', 'r');
    try {
      await f.sync();
    } finally {
      await f.close();
    }
    await link(p + '.tmp', p);
    await unlink(p + '.tmp');
    const parent = await open(dirname(p), 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  async function save(/** @type {string} */ p, /** @type {any} */ j) {
    const raw = JSON.stringify(j);
    if (Buffer.byteLength(raw) > 4096) throw Error('Model job limit');
    const f = await open(p + '.tmp', 'wx', 0o600);
    try {
      await f.writeFile(raw);
      await f.sync();
    } finally {
      await f.close();
    }
    await promote(p);
  }
  function validate(/** @type {any} */ j, /** @type {any} */ s, /** @type {any} */ i) {
    const d = j?.intent;
    if (
      !exact(j, ['schema', 'intent', 'digest']) ||
      j.schema !== 1 ||
      !exact(d, ['kind', 'binding', 'input', 'requestedAt']) ||
      d.kind !== 'model-apply-request' ||
      !same(d.binding, binding(s)) ||
      !same(d.input, i) ||
      !exact(d.input, ['conversationId', 'actionId', 'digest']) ||
      typeof d.requestedAt !== 'string' ||
      d.requestedAt.length > 100 ||
      !Number.isFinite(Date.parse(d.requestedAt)) ||
      hash(d) !== j.digest
    )
      throw Error('Model request integrity or owner scope differs');
    return j;
  }
  async function retained(/** @type {any} */ p, /** @type {any} */ s, /** @type {any} */ i) {
    let found = null;
    for (const stage of [false, true]) {
      const j = await read(p.path + (stage ? '.tmp' : ''));
      if (!j) continue;
      validate(j, s, i);
      if (found && !same(found.j, j)) throw Error('Conflicting staged model request');
      found ??= { j, stage };
    }
    return found;
  }
  async function reauthorize(/** @type {any} */ a, /** @type {any} */ request) {
    const now = await access(request);
    if (!same(binding(a.scope), binding(now.scope)))
      throw Error('Model request owner scope changed');
    return now;
  }
  const shape = (/** @type {any} */ j, /** @type {any} */ result) => ({
    ...j.intent.input,
    requestedAt: j.intent.requestedAt,
    requestSaved: true,
    approvalRecorded: false,
    ...result
  });
  async function held(/** @type {any} */ p, /** @type {any} */ j) {
    let found = null;
    for (const stage of [false, true]) {
      const r = await read(p.path + '.held' + (stage ? '.tmp' : ''));
      if (!r) continue;
      if (
        !exact(r, ['schema', 'intentDigest', 'status']) ||
        r.schema !== 1 ||
        r.intentDigest !== j.digest ||
        r.status !== 'held-for-review'
      )
        throw Error('Model request outcome integrity differs');
      if (found && !same(found, r)) throw Error('Conflicting model outcome stage');
      found = r;
    }
    return !!found;
  }
  async function load(/** @type {any} */ i, /** @type {any} */ a) {
    const p = await paths(a.scope, i);
    if (!p) throw Error('Saved human request required');
    const old = await retained(p, a.scope, i);
    if (!old || old.stage) throw Error('Finalized human model request required');
    return { p, j: old.j };
  }
  async function statusFor(
    /** @type {any} */ i,
    /** @type {any} */ a,
    /** @type {any} */ p,
    /** @type {any} */ j,
    /** @type {any} */ request
  ) {
    const reviews = await a.reviews.list(i.conversationId, request),
      review = reviews.find(
        (/** @type {any} */ x) => x.actionId === i.actionId && x.digest === i.digest
      );
    if (!review) throw Error('Exact requested proposal unavailable');
    const result = (await held(p, j))
      ? { status: 'held-for-review' }
      : review.approvalRecorded
        ? await a.publisher.status(i, request)
        : { status: 'checking-model-sources' };
    await reauthorize(a, request);
    return shape(j, { ...result, approvalRecorded: review.approvalRecorded === true });
  }
  return {
    available(/** @type {string} */ homeId) {
      return !!reviewsFor(homeId) && !!publisherFor(homeId);
    },
    async request(/** @type {any} */ raw, /** @type {any} */ request) {
      const i = input(raw),
        a = await access(request);
      let p = await paths(a.scope, i),
        old = p ? await retained(p, a.scope, i) : null;
      if (!old) {
        await a.reviews.preview(i, request);
        await reauthorize(a, request);
        p = await paths(a.scope, i, true);
      }
      const location = p;
      if (!location) throw Error('Model request directory unavailable');
      return withChatLock(join(location.actor, '.requests'), async () => {
        old = await retained(location, a.scope, i);
        await reauthorize(a, request);
        if (old) {
          if (old.stage) await promote(location.path);
          return statusFor(i, a, location, old.j, request);
        }
        // Preview is cheap (no original hashing) and rechecks the full saved baseline before consent is retained.
        await a.reviews.preview(i, request);
        await reauthorize(a, request);
        const intent = {
            kind: 'model-apply-request',
            binding: binding(a.scope),
            input: i,
            requestedAt: new Date().toISOString()
          },
          j = { schema: 1, intent, digest: hash(intent) };
        await save(location.path, j);
        return statusFor(i, a, location, j, request);
      });
    },
    async status(/** @type {any} */ raw, /** @type {any} */ request) {
      const i = input(raw),
        a = await access(request),
        { p, j } = await load(i, a);
      return statusFor(i, a, p, j, request);
    },
    async run(/** @type {any} */ raw, /** @type {any} */ request) {
      const i = input(raw),
        a = await access(request),
        { p, j } = await load(i, a);
      return withChatLock(join(p.home, '.run'), async () => {
        await reauthorize(a, request);
        if (await held(p, j)) return statusFor(i, a, p, j, request);
        let result,
          audited = false;
        try {
          await a.reviews.approve(i, request);
          audited = true;
          await reauthorize(a, request);
          result = await a.publisher.publish(i, request);
        } catch {
          result = { status: 'held-for-review' };
        }
        if (result.status === 'held-for-review') {
          await withChatLock(join(p.actor, '.requests'), async () => {
            if (!(await held(p, j)))
              await save(p.path + '.held', {
                schema: 1,
                intentDigest: j.digest,
                status: 'held-for-review'
              });
          });
        }
        return shape(j, { ...result, approvalRecorded: audited });
      });
    }
  };
}
