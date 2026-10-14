import { mkdir, lstat, readFile, open, link, unlink, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import {
  buildSourceAdmissionReview,
  validateSourceAdmissionDraft
} from './chat-source-admission.mjs';
import { assertExternalState } from './maintainer-journal.mjs';
import { withChatLock } from './chat-lock.mjs';
const hex = /^[a-f0-9]{64}$/,
  uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
const same = (/** @type {any} */ a, /** @type {any} */ b) => canonicalJSON(a) === canonicalJSON(b);
const exact = (/** @type {any} */ x, /** @type {string[]} */ keys) =>
  x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((k) => keys.includes(k));
const missing = (/** @type {any} */ e) => e?.code === 'ENOENT';
const binding = (/** @type {any} */ s) => ({
  homeId: s.homeId,
  principalId: s.principalId,
  ownerUserId: s.ownerUserId,
  root: s.root
});
/** Private current-owner source reviews/decisions and one-shot publication admission.
 * No token persistence, automatic startup job, model tool, upload or route registration.
 * publisherFor must construct the explicit source-only adapter using the supplied trusted reader.
 * @param {any} options */
export async function createChatSourceJobs({ directory, authorize, sourceFor, publisherFor }) {
  directory = resolve(directory);
  async function dir(/** @type {string} */ p, create = false) {
    try {
      const s = await lstat(p);
      if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
        throw Error('Private source job directory required');
      return true;
    } catch (e) {
      if (!missing(e)) throw e;
      if (!create) return false;
      await mkdir(p, { mode: 0o700 });
      return dir(p);
    }
  }
  await dir(directory, true);
  assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
  async function access(/** @type {any} */ request) {
    if (
      !exact(request, ['token', 'homeId']) ||
      typeof request.token !== 'string' ||
      request.token.length < 8 ||
      request.token.length > 16384
    )
      throw Error('Current source caller required');
    const a = await authorize(request),
      scope = validateChatScope(a.scope);
    if (
      scope.homeId !== request.homeId ||
      scope.role !== 'maintainer' ||
      scope.principalId !== scope.ownerUserId ||
      a.home?.id !== scope.homeId ||
      a.home.ownerUserId !== scope.ownerUserId ||
      !Number.isSafeInteger(a.home.revision) ||
      a.home.revision < 1 ||
      typeof a.fileVersion !== 'string' ||
      !a.fileVersion ||
      a.fileVersion.length > 500 ||
      Buffer.byteLength(JSON.stringify(a.home)) > 2 * 1024 * 1024
    )
      throw Error('Current designated owner and bounded home required');
    return { ...a, scope, home: structuredClone(a.home), token: request.token };
  }
  async function fresh(/** @type {any} */ a, /** @type {any} */ request, baseline = false) {
    const now = await access(request);
    if (
      !same(binding(now.scope), binding(a.scope)) ||
      (baseline && (now.fileVersion !== a.fileVersion || !same(now.home, a.home)))
    )
      throw Error('Source owner or baseline changed');
    return now;
  }
  function input(/** @type {any} */ x) {
    if (!exact(x, ['actionId', 'digest']) || !uuid.test(x.actionId) || !hex.test(x.digest))
      throw Error('Exact source review required');
    return structuredClone(x);
  }
  async function paths(/** @type {any} */ s, /** @type {any} */ i, create = false) {
    const home = join(directory, s.homeId),
      actor = join(home, s.principalId);
    for (const p of [directory, home, actor]) if (!(await dir(p, create))) return null;
    return { home, actor, base: join(actor, i.digest) };
  }
  async function read(/** @type {string} */ p) {
    try {
      const s = await lstat(p);
      if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 16384)
        throw Error('Private bounded source job required');
      const value = JSON.parse(await readFile(p, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Present source journal is corrupt');
      return value;
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }
  async function retained(/** @type {string} */ p, /** @type {(x:any)=>any} */ validate) {
    const value = await read(p),
      stage = await read(p + '.tmp');
    if (value) validate(value);
    if (stage) validate(stage);
    if (value && stage && !same(value, stage)) throw Error('Conflicting source job stage');
    return value ?? stage;
  }
  async function promote(/** @type {string} */ p, /** @type {()=>Promise<any>} */ guard) {
    const f = await open(p + '.tmp', 'r');
    try {
      await f.sync();
    } finally {
      await f.close();
    }
    await guard();
    try {
      await link(p + '.tmp', p);
    } catch (e) {
      if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'EEXIST') throw e;
      if (!same(await read(p), await read(p + '.tmp'))) throw Error('Source job collision');
    }
    await unlink(p + '.tmp');
    const d = await open(dirname(p), 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  async function save(
    /** @type {string} */ p,
    /** @type {any} */ value,
    /** @type {()=>Promise<any>} */ guard
  ) {
    const raw = JSON.stringify(value);
    if (Buffer.byteLength(raw) > 16384) throw Error('Source job byte limit');
    const final = await read(p),
      stage = await read(p + '.tmp');
    if ((final && !same(final, value)) || (stage && !same(stage, value)))
      throw Error('Immutable source job differs');
    if (!stage && !final) {
      const f = await open(p + '.tmp', 'wx', 0o600);
      try {
        await f.writeFile(raw);
        await f.sync();
      } finally {
        await f.close();
      }
    }
    if (await read(p + '.tmp')) await promote(p, guard);
    else await guard();
  }
  function review(/** @type {any} */ j, /** @type {any} */ a, /** @type {any} */ i) {
    if (
      !exact(j, ['schema', 'prepared']) ||
      j.schema !== 1 ||
      !exact(j.prepared, ['record', 'proposal', 'digest'])
    )
      throw Error('Source review shape differs');
    const { record: r, proposal: p, digest } = j.prepared;
    if (
      !exact(p, ['kind', 'binding', 'actionId', 'draft', 'baseline', 'sources', 'recordedAt']) ||
      p.kind !== 'source-admission' ||
      p.actionId !== i.actionId ||
      digest !== i.digest ||
      hash(p) !== digest ||
      !same(p.binding, binding(a.scope)) ||
      !exact(p.baseline, ['revision', 'fileVersion', 'homeDigest']) ||
      !Number.isSafeInteger(p.baseline.revision) ||
      p.baseline.revision < 1 ||
      typeof p.baseline.fileVersion !== 'string' ||
      !p.baseline.fileVersion ||
      p.baseline.fileVersion.length > 500 ||
      !hex.test(p.baseline.homeDigest) ||
      typeof p.recordedAt !== 'string' ||
      p.recordedAt.length > 100 ||
      !Number.isFinite(Date.parse(p.recordedAt))
    )
      throw Error('Source review integrity or scope differs');
    const draft = validateSourceAdmissionDraft(p.draft, p.actionId);
    if (
      !same(r, {
        id: p.actionId,
        homeId: a.scope.homeId,
        kind: draft.kind,
        value: draft.value,
        attachment: draft.attachment,
        authorUserId: a.scope.principalId,
        recordedAt: p.recordedAt
      }) ||
      !same(p.sources, [{ id: draft.sourceIds[0], sha256: draft.attachment.sha256 }])
    )
      throw Error('Original source record differs');
  }
  function decision(/** @type {any} */ d, /** @type {any} */ a, /** @type {any} */ i) {
    const x = d?.intent;
    if (
      !exact(d, ['schema', 'intent', 'digest']) ||
      d.schema !== 1 ||
      !exact(x, ['kind', 'binding', 'input', 'requestedAt']) ||
      x.kind !== 'source-save-request' ||
      !same(x.binding, binding(a.scope)) ||
      !same(x.input, i) ||
      typeof x.requestedAt !== 'string' ||
      x.requestedAt.length > 100 ||
      !Number.isFinite(Date.parse(x.requestedAt)) ||
      hash(x) !== d.digest
    )
      throw Error('Saved owner source decision differs');
  }
  async function load(/** @type {any} */ a, /** @type {any} */ i, requireDecision = false) {
    const p = await paths(a.scope, i);
    if (!p) throw Error('Saved source review required');
    const j = await retained(p.base + '.review.json', (x) => review(x, a, i));
    if (!j || !(await read(p.base + '.review.json')))
      throw Error('Finalized source review required');
    const d = await retained(p.base + '.decision.json', (x) => decision(x, a, i));
    if (requireDecision && (!d || !(await read(p.base + '.decision.json'))))
      throw Error('Finalized owner source request required');
    return { p, j, d };
  }
  const context = (/** @type {any} */ j) => ({
    proposal: j.prepared.proposal,
    digest: j.prepared.digest
  });
  async function readSourceApproval(
    /** @type {any} */ record,
    /** @type {any} */ supplied,
    /** @type {any} */ ctx
  ) {
    const request = { token: supplied.token, homeId: supplied.scope.homeId },
      a = await access(request),
      i = input({ actionId: record.id, digest: ctx?.digest }),
      { j } = await load(a, i, true);
    if (
      !same(binding(a.scope), binding(supplied.scope)) ||
      a.fileVersion !== supplied.fileVersion ||
      !same(a.home, supplied.home)
    )
      throw Error('Current source publication access changed');
    if (!same(record, j.prepared.record) || !same(context(j), ctx))
      throw Error('Exact saved owner source review differs');
    await fresh(a, request, true);
    return structuredClone(context(j));
  }
  function marker(/** @type {any} */ x, /** @type {any} */ d) {
    if (!exact(x, ['schema', 'decisionDigest']) || x.schema !== 1 || x.decisionDigest !== d.digest)
      throw Error('Source publication admission differs');
  }
  function result(/** @type {any} */ x, /** @type {any} */ d) {
    if (
      !exact(x, ['schema', 'decisionDigest', 'outcome']) ||
      x.schema !== 1 ||
      x.decisionDigest !== d.digest ||
      !x.outcome ||
      !['accepted', 'held-for-review'].includes(x.outcome.status) ||
      !same(
        Object.keys(x.outcome).sort(),
        (x.outcome.status === 'accepted' ? ['revision', 'status'] : ['status']).sort()
      ) ||
      (x.outcome.status === 'accepted' &&
        (!Number.isSafeInteger(x.outcome.revision) || x.outcome.revision < 1))
    )
      throw Error('Source publication outcome differs');
  }
  function shape(
    /** @type {any} */ j,
    /** @type {any} */ d,
    /** @type {any} */ outcome = { status: 'checking-source' }
  ) {
    return {
      actionId: j.prepared.record.id,
      digest: j.prepared.digest,
      sourceId: j.prepared.proposal.draft.sourceIds[0],
      title: j.prepared.record.value,
      baseRevision: j.prepared.proposal.baseline.revision,
      requestSaved: !!d,
      ...(d ? { requestedAt: d.intent.requestedAt } : {}),
      ...outcome
    };
  }
  async function statusFor(/** @type {any} */ a, /** @type {any} */ i, /** @type {any} */ request) {
    const { p, j, d } = await load(a, i);
    let outcome = { status: 'source-review-ready' };
    if (d) {
      const done = await retained(p.base + '.result.json', (x) => result(x, d));
      const finalized = done && (await read(p.base + '.result.json'));
      outcome = finalized ? done.outcome : { status: 'checking-source' };
      const started = await retained(p.base + '.started.json', (x) => marker(x, d));
      if (!finalized && (started || done)) outcome = { status: 'publication-pending' };
    }
    await fresh(a, request);
    return shape(j, d, outcome);
  }
  return {
    async prepare(/** @type {any} */ raw, /** @type {any} */ request) {
      if (
        !exact(raw, ['sourceId']) ||
        typeof raw.sourceId !== 'string' ||
        !raw.sourceId.startsWith('evidence-') ||
        !uuid.test(raw.sourceId.slice(9))
      )
        throw Error('Exact own upload required');
      const a = await access(request),
        original = await sourceFor(raw.sourceId, request);
      const prepared = buildSourceAdmissionReview(original, a);
      await fresh(a, request, true);
      const accepted =
        a.home.sources?.filter((/** @type {any} */ s) => s.id === raw.sourceId) ?? [];
      if (accepted.length) {
        const s = accepted[0],
          rows =
            a.home.contributionEvidence?.filter(
              (/** @type {any} */ r) => r.id === prepared.record.id
            ) ?? [];
        if (
          accepted.length !== 1 ||
          s.title !== prepared.record.value ||
          s.authorUserId !== a.scope.principalId ||
          s.sourceUserId !== a.scope.principalId ||
          s.contributionId !== prepared.record.id ||
          !same(s.attachment, prepared.record.attachment) ||
          rows.length !== 1 ||
          !same(
            Object.fromEntries(Object.entries(rows[0]).filter(([k]) => k !== 'sourceUserId')),
            prepared.record
          )
        )
          throw Error('Accepted original identity differs');
        return {
          actionId: prepared.record.id,
          sourceId: raw.sourceId,
          status: 'accepted',
          revision: a.home.revision,
          alreadyAccepted: true
        };
      }
      const i = input({ actionId: prepared.record.id, digest: prepared.digest }),
        p = await paths(a.scope, i, true);
      if (!p) throw Error('Private source state unavailable');
      return withChatLock(join(p.actor, '.requests'), async () => {
        const old = await retained(p.base + '.review.json', (x) => review(x, a, i));
        const names = await readdir(p.actor);
        const count = new Set(
          names
            .filter((n) => /^[a-f0-9]{64}\.review\.json(?:\.tmp)?$/.test(n))
            .map((n) => n.slice(0, 64))
        ).size;
        if (!old && count >= 50) throw Error('Retained source review capacity reached');
        await save(p.base + '.review.json', old ?? { schema: 1, prepared }, () =>
          fresh(a, request, true)
        );
        return statusFor(a, i, request);
      });
    },
    async request(/** @type {any} */ raw, /** @type {any} */ request) {
      const i = input(raw),
        a = await access(request),
        { p, j } = await load(a, i);
      return withChatLock(join(p.actor, '.requests'), async () => {
        const old = await retained(p.base + '.decision.json', (x) => decision(x, a, i));
        if (
          !old &&
          (j.prepared.proposal.baseline.fileVersion !== a.fileVersion ||
            j.prepared.proposal.baseline.homeDigest !== hash(a.home))
        )
          throw Error('Source review stale; prepare a new review');
        const intent = old?.intent ?? {
            kind: 'source-save-request',
            binding: binding(a.scope),
            input: i,
            requestedAt: new Date().toISOString()
          },
          d = old ?? { schema: 1, intent, digest: hash(intent) };
        await save(p.base + '.decision.json', d, () => fresh(a, request, !old));
        return statusFor(a, i, request);
      });
    },
    async status(/** @type {any} */ raw, /** @type {any} */ request) {
      return statusFor(await access(request), input(raw), request);
    },
    async run(/** @type {any} */ raw, /** @type {any} */ request) {
      const i = input(raw),
        a = await access(request),
        { p, j, d } = await load(a, i, true);
      return withChatLock(join(p.home, '.run'), async () => {
        const now = await fresh(a, request);
        await readSourceApproval(j.prepared.record, now, context(j));
        const done = await retained(p.base + '.result.json', (x) => result(x, d));
        if (done) {
          await save(p.base + '.result.json', done, () => fresh(a, request));
          return statusFor(a, i, request);
        }
        const publisher = publisherFor(a.scope.homeId, readSourceApproval);
        if (!publisher) throw Error('Source publication unavailable');
        const started = await retained(p.base + '.started.json', (x) => marker(x, d));
        let outcome;
        if (started) {
          await save(p.base + '.started.json', started, () => fresh(a, request));
          outcome = await publisher.resolvePublication(
            j.prepared.record,
            await access(request),
            context(j)
          );
        } else {
          const current = await access(request);
          if (
            current.fileVersion !== j.prepared.proposal.baseline.fileVersion ||
            hash(current.home) !== j.prepared.proposal.baseline.homeDigest
          )
            throw Error('Source baseline changed before publication');
          await save(p.base + '.started.json', { schema: 1, decisionDigest: d.digest }, () =>
            fresh(current, request, true)
          );
          try {
            outcome = await publisher.publish(j.prepared.record, await access(request), context(j));
          } catch {
            outcome = null;
          }
        }
        await fresh(a, request);
        if (!outcome || outcome.status === 'publication-pending')
          return shape(j, d, { status: 'publication-pending' });
        const value = { schema: 1, decisionDigest: d.digest, outcome };
        result(value, d);
        await save(p.base + '.result.json', value, () => fresh(a, request));
        return statusFor(a, i, request);
      });
    }
  };
}
