import { lstat, readFile, mkdir, rmdir, open, rename, link, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { assertExternalState } from './maintainer-journal.mjs';
import { assertConfirmedAdmissionState } from './admission-journal.mjs';
import { assertConfirmedRefresh } from './household-refresh-state.mjs';
import { createCallerMaintainerClient } from './fulcra-ingest.mjs';
import { buildModelPublicationIntent } from './model-publication-intent.mjs';
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
const missing = (/** @type {any} */ e) => e?.code === 'ENOENT';
const hex = /^[a-f0-9]{64}$/;
const same = (/** @type {any} */ a, /** @type {any} */ b) => canonicalJSON(a) === canonicalJSON(b);
/** Native current-token model writer. Requires a separately persisted exact human owner decision.
 * Uses the existing per-home maintainer lock and shared publication pointer. Pending retry is read-only.
 * No model tool/route registration, implicit approval, grants, token fallback or rollback execution.
 * @param {any} options */
export function createChatModelPublisher({
  directory,
  authorize,
  verifySources,
  readApproved,
  prepareModelPatch,
  clientFor = createCallerMaintainerClient
}) {
  directory = resolve(directory);
  async function privateDir(/** @type {string} */ path, create = false) {
    if (create) await mkdir(path, { mode: 0o700 });
    const st = await lstat(path);
    if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
      throw Error('Private existing model maintainer state required');
  }
  async function read(/** @type {string} */ path) {
    try {
      const st = await lstat(path);
      if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 8 * 1024 * 1024)
        throw Error('Private bounded model publication state required');
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }
  async function save(/** @type {string} */ path, /** @type {any} */ value, immutable = false) {
    const raw = JSON.stringify(value);
    if (Buffer.byteLength(raw) > 8 * 1024 * 1024)
      throw Error('Model publication intent exceeds limit');
    const old = await read(path);
    if (immutable && old) {
      if (!same(old, value)) throw Error('Immutable model intent collision');
      return;
    }
    const temp = join(dirname(path), '.model-' + randomUUID() + '.tmp'),
      f = await open(temp, 'wx', 0o600);
    try {
      await f.writeFile(raw);
      await f.sync();
    } finally {
      await f.close();
    }
    if (immutable) {
      try {
        await link(temp, path);
      } catch (e) {
        if (
          !e ||
          typeof e !== 'object' ||
          !('code' in e) ||
          e.code !== 'EEXIST' ||
          !same(await read(path), value)
        )
          throw e;
      } finally {
        await unlink(temp);
      }
    } else await rename(temp, path);
    const d = await open(dirname(path), 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  async function access(/** @type {any} */ request) {
    if (
      !request ||
      Object.keys(request).length !== 2 ||
      typeof request.homeId !== 'string' ||
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
      scope.principalId !== scope.ownerUserId ||
      a.home?.id !== scope.homeId ||
      a.home.ownerUserId !== scope.ownerUserId
    )
      throw Error('Current designated model owner required');
    return { ...a, scope, token: request.token };
  }
  const bound = (/** @type {any} */ a) => ({
    homeId: a.scope.homeId,
    principalId: a.scope.principalId,
    root: a.scope.root
  });
  function identity(/** @type {any} */ x, /** @type {any} */ b) {
    if (
      x.home?.id !== b.homeId ||
      x.home.ownerUserId !== b.principalId ||
      x.principalId !== b.principalId ||
      x.root !== b.root ||
      !Array.isArray(x.unavailableMembers) ||
      x.unavailableMembers.length
    )
      throw Error('Current model maintainer intake differs');
  }
  async function state(/** @type {any} */ b) {
    const cp = await read(join(directory, 'checkpoint.json'));
    if (
      !cp ||
      cp.schema !== 'home-twin-checkpoint/1' ||
      Object.entries(b).some(([k, v]) => cp[k] !== v)
    )
      throw Error('Existing home maintainer checkpoint differs');
    /** @type {[string,string,(pointer:any,intent:any)=>void][]} */
    const household = [
      ['admission', 'admissions', assertConfirmedAdmissionState],
      ['household-refresh', 'household-refresh', assertConfirmedRefresh]
    ];
    for (const [name, folder, assert] of household) {
      const pointer = await read(join(directory, name + '.json'));
      if (!pointer) continue;
      if (
        pointer.status === 'pending' ||
        !hex.test(pointer.intentId) ||
        Object.entries(b).some(([k, v]) => pointer[k] !== v)
      )
        throw Error('Resolve pending household state before model publication');
      assert(pointer, await read(join(directory, folder, pointer.intentId + '.json')));
    }
    const pointer = await read(join(directory, 'publication.json'));
    if (
      pointer &&
      (!hex.test(pointer.intentId) ||
        !['pending', 'confirmed'].includes(pointer.status) ||
        Object.entries(b).some(([k, v]) => pointer[k] !== v))
    )
      throw Error('Shared publication pointer differs');
    if (pointer?.status === 'confirmed') {
      const saved = await read(join(directory, 'publications', pointer.intentId + '.json'));
      if (!saved) throw Error('Confirmed shared intent unavailable; preserve pointer');
      const { intentId, ...body } = saved;
      if (
        intentId !== pointer.intentId ||
        hash(body) !== intentId ||
        hash(saved.base) !== saved.baseDigest ||
        hash(saved.target) !== saved.targetDigest ||
        !['home-twin-publication/1', 'home-twin-model-publication/1'].includes(saved.schema) ||
        Object.entries(b).some(([k, v]) => saved[k] !== v) ||
        pointer.result?.intentId !== intentId ||
        pointer.result?.revision !== saved.target?.revision
      )
        throw Error('Confirmed shared publication integrity differs');
    }
    return pointer;
  }
  async function inspected(
    /** @type {any} */ input,
    /** @type {any} */ request,
    /** @type {any} */ initial,
    /** @type {any} */ review,
    /** @type {any} */ client
  ) {
    const a = await access(request),
      b = bound(a);
    if (!same(b, bound(initial))) throw Error('Current owner scope changed');
    const proof = await readApproved(input, request);
    if (!same(proof, review)) throw Error('Exact saved model approval changed');
    const native = await client.read();
    identity(native, b);
    if (!same(a.home, native.home) || a.fileVersion !== native.baselineVersion)
      throw Error('Current model baseline reads differ');
    const intent = buildModelPublicationIntent(a, proof);
    for (const s of proof.proposal.sources) {
      const rows = native.sourceChecks?.filter((/** @type {any} */ r) => r.id === s.id) ?? [];
      if (rows.length !== 1 || rows[0].status !== 'unchanged' || rows[0].currentSHA256 !== s.sha256)
        throw Error('Accepted model original needs review');
    }
    const originals = await verifySources(proof.proposal.draft.sourceIds, a);
    if (
      !Array.isArray(originals) ||
      !same(
        [...originals].sort((x, y) => x.id.localeCompare(y.id)),
        proof.proposal.sources
      )
    )
      throw Error('Reviewed model original changed');
    const last = await access(request),
      end = await client.read();
    identity(end, b);
    if (
      !same(bound(last), b) ||
      !same(last.home, a.home) ||
      last.fileVersion !== a.fileVersion ||
      !same(end.home, native.home) ||
      end.baselineVersion !== native.baselineVersion ||
      !same(end.sourceChecks, native.sourceChecks) ||
      !same(end.rows, native.rows)
    )
      throw Error('Model owner, source or baseline changed during verification');
    const after = await access(request);
    if (!same(bound(after), b) || !same(after.home, a.home) || after.fileVersion !== a.fileVersion)
      throw Error('Current model authority changed after final native verification');
    return intent;
  }
  function validateIntent(
    /** @type {any} */ intent,
    /** @type {any} */ review,
    /** @type {any} */ b
  ) {
    if (!intent) throw Error('Model intent missing');
    const { intentId, ...payload } = intent;
    if (
      intent.schema !== 'home-twin-model-publication/1' ||
      hash(payload) !== intentId ||
      hash(intent.base) !== intent.baseDigest ||
      hash(intent.target) !== intent.targetDigest ||
      Object.entries(b).some(([k, v]) => intent[k] !== v) ||
      intent.review?.proposalDigest !== review.digest
    )
      throw Error('Exact model publication intent differs');
    const expected = buildModelPublicationIntent(
      {
        scope: { ...review.proposal.binding, role: 'maintainer' },
        home: intent.base,
        fileVersion: intent.baselineVersion
      },
      review
    );
    if (!same(expected, intent)) throw Error('Model intent target or inverse differs');
  }
  async function associated(/** @type {any} */ review, /** @type {any} */ b) {
    const dir = join(directory, 'model-publication-actions');
    try {
      await privateDir(dir);
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
    const index = await read(join(dir, review.digest + '.json'));
    if (!index) return null;
    if (
      Object.keys(index).length !== 3 ||
      index.schema !== 1 ||
      index.approvalDigest !== review.digest ||
      !hex.test(index.intentId)
    )
      throw Error('Model approval association differs');
    const intent = await read(join(directory, 'publications', index.intentId + '.json'));
    if (intent?.intentId !== index.intentId) throw Error('Model approval intent missing');
    validateIntent(intent, review, b);
    return intent;
  }
  async function confirm(
    /** @type {any} */ intent,
    /** @type {any} */ request,
    /** @type {any} */ initial,
    /** @type {any} */ review,
    /** @type {any} */ client
  ) {
    const a = await access(request),
      b = bound(a);
    if (
      !same(b, bound(initial)) ||
      !same(
        await readApproved(
          {
            actionId: review.proposal.actionId,
            conversationId: review.proposal.conversationId,
            digest: review.digest
          },
          request
        ),
        review
      )
    )
      throw Error('Current saved model owner approval differs');
    const current = await client.read();
    identity(current, b);
    let accepted = current.home;
    if (hash(accepted) !== intent.targetDigest)
      accepted = await client.readSnapshot(b.root + '/history/' + intent.targetDigest + '.json');
    if (!accepted || hash(accepted) !== intent.targetDigest)
      return { status: 'publication-pending' };
    const last = await access(request);
    if (!same(bound(last), b)) throw Error('Current model owner changed during readback');
    const pointer = await state(b);
    const result = {
      status: 'model-applied',
      revision: intent.target.revision,
      intentId: intent.intentId
    };
    if (pointer?.intentId === intent.intentId && pointer.status === 'pending')
      await save(join(directory, 'publication.json'), { ...pointer, status: 'confirmed', result });
    const receipts = join(directory, 'model-publication-results');
    try {
      await privateDir(receipts);
    } catch (e) {
      if (!missing(e)) throw e;
      await privateDir(receipts, true);
    }
    await save(
      join(receipts, review.digest + '.json'),
      {
        schema: 1,
        approvalDigest: review.digest,
        intentId: intent.intentId,
        targetDigest: intent.targetDigest,
        revision: intent.target.revision
      },
      true
    );
    return result;
  }
  /** @returns {Promise<any>} */
  async function run(/** @type {any} */ input, /** @type {any} */ request, readonly = false) {
    let locked = false;
    /** @type {any} */ let client;
    /** @type {any} */ let initial;
    /** @type {any} */ let review;
    /** @type {any} */ let intent;
    const lock = join(directory, '.cycle.lock');
    try {
      await privateDir(directory);
      assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
      await mkdir(lock, { mode: 0o700 });
      locked = true;
      initial = await access(request);
      const b = bound(initial),
        pointer = await state(b);
      review = await readApproved(input, request);
      client = clientFor(
        b.homeId,
        { root: b.root, checkSources: true, sourceMaxBytes: 200 * 1024 * 1024 },
        request.token
      );
      intent = await associated(review, b);
      if (intent) return await confirm(intent, request, initial, review, client);
      if (readonly) return { status: 'held-for-review' };
      if (pointer?.status === 'pending') return { status: 'publication-pending' };
      intent = await inspected(input, request, initial, review, client);
      const intents = join(directory, 'publications'),
        indices = join(directory, 'model-publication-actions');
      for (const dir of [intents, indices]) {
        try {
          await privateDir(dir);
        } catch (e) {
          if (!missing(e)) throw e;
          await privateDir(dir, true);
        }
      }
      await save(join(intents, intent.intentId + '.json'), intent, true);
      await save(
        join(indices, review.digest + '.json'),
        { schema: 1, approvalDigest: review.digest, intentId: intent.intentId },
        true
      );
      const pp = join(directory, 'publication.json');
      /** @type {any} */ let progress = {
        ...b,
        intentId: intent.intentId,
        status: 'pending',
        operations: {}
      };
      await save(pp, progress);
      const guard = async () => {
        const fresh = await inspected(input, request, initial, review, client);
        if (fresh.intentId !== intent.intentId) throw Error('Exact reviewed model intent changed');
      };
      const backup = b.root + '/history/' + intent.baseDigest + '.json',
        prior = await client.readSnapshot(backup);
      if (prior && hash(prior) !== intent.baseDigest) throw Error('Model prior snapshot collision');
      if (!prior) {
        await guard();
        progress.operations['backup'] = 'in-flight';
        await save(pp, progress);
        try {
          await client.write(backup, intent.base, guard);
        } catch {}
        if (hash(await client.readSnapshot(backup)) !== intent.baseDigest)
          return { status: 'publication-pending' };
      }
      progress.operations['backup'] = 'confirmed';
      await save(pp, progress);
      await guard();
      progress.operations['home'] = 'in-flight';
      await save(pp, progress);
      try {
        await client.write(b.root + '/home.json', intent.target, guard);
      } catch {}
      return await confirm(intent, request, initial, review, client);
    } catch {
      if (locked && intent && client && review && initial) {
        try {
          return await confirm(intent, request, initial, review, client);
        } catch {}
      }
      return { status: intent ? 'publication-pending' : 'held-for-review' };
    } finally {
      if (locked) await rmdir(lock);
    }
  }
  /** Read-only cloud operation; creates a distinct private inverse proposal, never approval or upload. */
  async function prepareRollback(/** @type {any} */ input, /** @type {any} */ request) {
    let locked = false;
    const lock = join(directory, '.cycle.lock');
    try {
      if (typeof prepareModelPatch !== 'function')
        throw Error('Model inverse preparation unavailable');
      await privateDir(directory);
      assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
      await mkdir(lock, { mode: 0o700 });
      locked = true;
      const initial = await access(request),
        b = bound(initial),
        pointer = await state(b);
      if (pointer?.status === 'pending')
        throw Error('Resolve pending writes before inverse preparation');
      const review = await readApproved(input, request),
        intent = await associated(review, b);
      if (!intent) throw Error('Accepted model intent required for inverse');
      const client = clientFor(
        b.homeId,
        { root: b.root, checkSources: true, sourceMaxBytes: 200 * 1024 * 1024 },
        request.token
      );
      if ((await confirm(intent, request, initial, review, client)).status !== 'model-applied')
        throw Error('Exact accepted target proof unavailable');
      const current = await client.read();
      identity(current, b);
      const a = await access(request);
      if (
        !same(bound(a), b) ||
        !same(a.home, current.home) ||
        a.fileVersion !== current.baselineVersion ||
        hash(current.home.reconstruction?.buildingModel) !== intent.rollbackBaseline.modelDigest ||
        !same(
          current.home.reconstruction?.userOverrides ?? null,
          intent.target.reconstruction?.userOverrides ?? null
        )
      )
        throw Error('Accepted target model or construction choice changed');
      for (const source of intent.review.sources) {
        const before =
            intent.target.sources?.filter((/** @type {any} */ s) => s.id === source.id) ?? [],
          now = current.home.sources?.filter((/** @type {any} */ s) => s.id === source.id) ?? [],
          checks = current.sourceChecks?.filter((/** @type {any} */ s) => s.id === source.id) ?? [];
        if (
          before.length !== 1 ||
          now.length !== 1 ||
          !same(before, now) ||
          checks.length !== 1 ||
          checks[0].status !== 'unchanged' ||
          checks[0].currentSHA256 !== source.sha256
        )
          throw Error('Inverse source version changed');
      }
      const originals = await verifySources(review.proposal.draft.sourceIds, a);
      if (
        !Array.isArray(originals) ||
        !same(
          [...originals].sort((x, y) => x.id.localeCompare(y.id)),
          intent.review.sources
        )
      )
        throw Error('Inverse original changed');
      const end = await client.read();
      identity(end, b);
      const last = await access(request);
      if (
        !same(bound(last), b) ||
        !same(end.home, current.home) ||
        end.baselineVersion !== current.baselineVersion ||
        !same(end.sourceChecks, current.sourceChecks) ||
        !same(last.home, current.home) ||
        last.fileVersion !== current.baselineVersion
      )
        throw Error('Current inverse baseline changed');
      const key = hash({
        targetIntentId: intent.intentId,
        homeDigest: hash(current.home),
        fileVersion: current.baselineVersion
      });
      const turnId =
        key.slice(0, 8) +
        '-' +
        key.slice(8, 12) +
        '-5' +
        key.slice(13, 16) +
        '-8' +
        key.slice(17, 20) +
        '-' +
        key.slice(20, 32);
      return await prepareModelPatch(
        { ...intent.inverse, note: 'Undo approved model change ' + intent.review.actionId },
        { conversationId: intent.review.conversationId, turnId },
        request,
        {
          revision: current.home.revision,
          fileVersion: current.baselineVersion,
          homeDigest: hash(current.home),
          modelDigest: hash(current.home.reconstruction.buildingModel),
          binding: review.proposal.binding
        }
      );
    } catch {
      return { status: 'held-for-review' };
    } finally {
      if (locked) await rmdir(lock);
    }
  }
  /** Cheap current-owner status of an already verified receipt; no original hashing, remote effects or new approval. */
  async function status(/** @type {any} */ input, /** @type {any} */ request) {
    try {
      await privateDir(directory);
      assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
      const a = await access(request),
        b = bound(a);
      await state(b);
      const review = await readApproved(input, request),
        intent = await associated(review, b);
      if (!intent) return { status: 'model-approval-recorded' };
      const dir = join(directory, 'model-publication-results');
      try {
        await privateDir(dir);
      } catch (e) {
        if (missing(e)) return { status: 'publication-pending' };
        throw e;
      }
      const receipt = await read(join(dir, review.digest + '.json'));
      if (!receipt) return { status: 'publication-pending' };
      if (
        !same(receipt, {
          schema: 1,
          approvalDigest: review.digest,
          intentId: intent.intentId,
          targetDigest: intent.targetDigest,
          revision: intent.target.revision
        })
      )
        throw Error('Exact model readback receipt differs');
      const last = await access(request);
      if (!same(bound(last), b)) throw Error('Model status owner changed');
      return {
        status: 'model-applied',
        revision: intent.target.revision,
        intentId: intent.intentId
      };
    } catch {
      return { status: 'held-for-review' };
    }
  }
  return {
    prepareRollback,
    status,
    publish: (/** @type {any} */ input, /** @type {any} */ request) => run(input, request),
    resolvePublication: (/** @type {any} */ input, /** @type {any} */ request) =>
      run(input, request, true)
  };
}
