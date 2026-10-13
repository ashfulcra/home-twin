import { mkdir, lstat, readFile, open, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateHomeAction } from '../src/lib/home/chat-action.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { withChatLock } from './chat-lock.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = (/** @type {any} */ value) =>
  createHash('sha256').update(canonicalJSON(value)).digest('hex');
const binding = (/** @type {any} */ s) => ({
  homeId: s.homeId,
  principalId: s.principalId,
  ownerUserId: s.ownerUserId,
  root: s.root
});
const missing = (/** @type {any} */ e) => e?.code === 'ENOENT';
/** Review proposals are private. Only an exact later user approval can save a contribution.
 * Current authority/IO/publication are injected; no CLI credentials or arbitrary paths. @param {any} options */
export async function createChatActions({
  directory,
  authorize,
  verifySources,
  ioFor,
  publish,
  resolvePublication,
  secretsFor = () => []
}) {
  async function privateDir(/** @type {string} */ path) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const st = await lstat(path);
    if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
      throw Error('Private action directory required');
    return path;
  }
  await privateDir(directory);
  async function access(/** @type {any} */ request) {
    if (
      !request ||
      Object.keys(request).some((k) => !['token', 'homeId'].includes(k)) ||
      typeof request.token !== 'string' ||
      request.token.length < 8
    )
      throw Error('Current action caller required');
    const a = await authorize(request),
      scope = validateChatScope(a.scope);
    if (
      scope.homeId !== request.homeId ||
      !['maintainer', 'contributor'].includes(scope.role) ||
      a.home?.id !== scope.homeId ||
      a.home.ownerUserId !== scope.ownerUserId ||
      !Number.isSafeInteger(a.home.revision) ||
      typeof a.fileVersion !== 'string' ||
      !a.fileVersion
    )
      throw Error('Current contribution role required');
    return { ...a, scope, token: request.token };
  }
  async function folder(
    /** @type {any} */ scope,
    /** @type {string} */ conversationId,
    create = true
  ) {
    if (!uuid.test(conversationId)) throw Error('Choose a conversation');
    if (!create) {
      const path = join(directory, scope.homeId, scope.principalId, conversationId);
      for (const current of [
        directory,
        join(directory, scope.homeId),
        join(directory, scope.homeId, scope.principalId),
        path
      ]) {
        try {
          const st = await lstat(current);
          if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
            throw Error('Private action directory required');
        } catch (e) {
          if (missing(e)) return null;
          throw e;
        }
      }
      return path;
    }
    await privateDir(join(directory, scope.homeId));
    const actor = await privateDir(join(directory, scope.homeId, scope.principalId));
    const conversations = await readdir(actor);
    if (conversations.some((name) => !uuid.test(name))) throw Error('Action discovery incomplete');
    if (!conversations.includes(conversationId) && conversations.length >= 30)
      throw Error('Retained action capacity reached; inspect existing conversations');
    return privateDir(join(actor, conversationId));
  }
  async function save(/** @type {string} */ path, /** @type {any} */ value) {
    const raw = JSON.stringify(value);
    if (Buffer.byteLength(raw) > 32768) throw Error('Private action exceeds byte limit');
    const tmp = path + '.' + randomUUID();
    const f = await open(tmp, 'wx', 0o600);
    try {
      await f.writeFile(raw);
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(tmp, path);
    const d = await open(join(path, '..'), 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  async function load(/** @type {string} */ path, /** @type {any} */ scope) {
    const st = await lstat(path);
    if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 32768)
      throw Error('Private bounded action required');
    const j = JSON.parse(await readFile(path, 'utf8'));
    if (
      j.schema !== 1 ||
      canonicalJSON(j.proposal.binding) !== canonicalJSON(binding(scope)) ||
      sha(j.proposal) !== j.digest ||
      !uuid.test(j.proposal.actionId) ||
      !uuid.test(j.proposal.conversationId) ||
      !uuid.test(j.proposal.turnId) ||
      !['proposed', 'pending', 'confirmed'].includes(j.state) ||
      (j.approvalDigest !== undefined && j.approvalDigest !== j.digest) ||
      (j.approvalState !== undefined && !['queued', 'unconfirmed'].includes(j.approvalState))
    )
      throw Error('Action integrity or scope differs');
    validateHomeAction(j.proposal.draft);
    return j;
  }
  /** @param {any} input */
  function validateApproval(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== 3 ||
      Object.keys(input).some((k) => !['actionId', 'conversationId', 'digest'].includes(k)) ||
      !uuid.test(input.actionId) ||
      !uuid.test(input.conversationId) ||
      !/^[a-f0-9]{64}$/.test(input.digest)
    )
      throw Error('Exact reviewed action required');
  }
  function view(/** @type {any} */ j) {
    return {
      actionId: j.proposal.actionId,
      digest: j.digest,
      conversationId: j.proposal.conversationId,
      turnId: j.proposal.turnId,
      draft: structuredClone(j.proposal.draft),
      baseRevision: j.proposal.baseline.revision,
      sourceChecks: structuredClone(j.proposal.sources),
      status:
        j.result?.status ??
        (j.state === 'pending'
          ? 'pending-readback'
          : j.approvalState === 'unconfirmed'
            ? 'save-unconfirmed'
            : j.state === 'confirmed'
              ? 'contribution-confirmed'
              : j.approvalDigest === j.digest
                ? 'queued'
                : 'proposed'),
      ...(j.approvalDigest === j.digest ? { approvalRequested: true } : {}),
      ...(j.result?.revision ? { revision: j.result.revision } : {})
    };
  }
  async function sourceChecks(/** @type {any} */ draft, /** @type {any} */ a) {
    const checks = await verifySources(draft.sourceIds, a);
    if (
      !Array.isArray(checks) ||
      checks.length !== draft.sourceIds.length ||
      checks.some(
        (x) =>
          !draft.sourceIds.includes(x.id) ||
          typeof x.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(x.sha256)
      ) ||
      new Set(checks.map((x) => x.id)).size !== checks.length
    )
      throw Error('Original source verification incomplete');
    return checks
      .map((x) => ({ id: x.id, sha256: x.sha256 }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async function fresh(/** @type {any} */ j, /** @type {any} */ request) {
    const a = await access(request);
    if (
      canonicalJSON(binding(a.scope)) !== canonicalJSON(j.proposal.binding) ||
      a.fileVersion !== j.proposal.baseline.fileVersion ||
      sha(a.home) !== j.proposal.baseline.homeDigest
    )
      throw Error('Home changed; prepare a new review');
    if (
      canonicalJSON(await sourceChecks(j.proposal.draft, a)) !== canonicalJSON(j.proposal.sources)
    )
      throw Error('Reviewed original changed');
    const current = await access(request);
    if (
      canonicalJSON(binding(current.scope)) !== canonicalJSON(j.proposal.binding) ||
      current.fileVersion !== j.proposal.baseline.fileVersion ||
      sha(current.home) !== j.proposal.baseline.homeDigest
    )
      throw Error('Home changed during source verification; prepare a new review');
    return current;
  }
  return {
    async prepare(
      /** @type {any} */ input,
      /** @type {any} */ context,
      /** @type {any} */ request
    ) {
      const a = await access(request),
        draft = validateHomeAction(input);
      if (
        !context ||
        Object.keys(context).some((k) => !['conversationId', 'turnId'].includes(k)) ||
        !uuid.test(context.conversationId) ||
        !uuid.test(context.turnId)
      )
        throw Error('Current conversation required');
      const raw = JSON.stringify(draft);
      if (
        [request.token, ...secretsFor(a.scope)].some(
          (s) => typeof s === 'string' && s.length >= 8 && raw.includes(s)
        ) ||
        /sk-ant-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}/.test(raw)
      )
        throw Error('Credentials cannot be saved as a record');
      const identity = sha({ binding: binding(a.scope), ...context, draft }),
        actionId =
          identity.slice(0, 8) +
          '-' +
          identity.slice(8, 12) +
          '-5' +
          identity.slice(13, 16) +
          '-8' +
          identity.slice(17, 20) +
          '-' +
          identity.slice(20, 32),
        dir = await folder(a.scope, context.conversationId);
      if (!dir) throw Error('Private proposal directory required');
      const path = join(dir, actionId + '.json');
      return withChatLock(path, async () => {
        try {
          return view(await load(path, a.scope));
        } catch (e) {
          if (!missing(e)) throw e;
        }
        if ((await readdir(dir)).filter((n) => n.endsWith('.json')).length >= 100)
          throw Error('Retained action capacity reached; inspect existing proposals');
        const sources = await sourceChecks(draft, a),
          proposal = {
            binding: binding(a.scope),
            actionId,
            ...context,
            draft,
            baseline: {
              revision: a.home.revision,
              fileVersion: a.fileVersion,
              homeDigest: sha(a.home)
            },
            sources,
            recordedAt: new Date().toISOString()
          };
        const j = { schema: 1, proposal, digest: sha(proposal), state: 'proposed' };
        await fresh(j, request);
        // Reserve 2KiB for bounded lifecycle results before approving any effect.
        if (Buffer.byteLength(JSON.stringify(j)) > 30720)
          throw Error('Private action exceeds preparation byte limit');
        await save(path, j);
        return view(j);
      });
    },
    async list(/** @type {string} */ conversationId, /** @type {any} */ request) {
      if (!uuid.test(conversationId)) throw Error('Choose a conversation');
      const a = await access(request),
        dir = await folder(a.scope, conversationId, false);
      if (!dir) return [];
      const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
      if (names.length > 100) throw Error('Action discovery incomplete');
      const out = [];
      for (const name of names) {
        if (!uuid.test(name.slice(0, -5))) throw Error('Action state unknown');
        const j = await load(join(dir, name), a.scope);
        if (j.proposal.conversationId === conversationId) out.push(view(j));
      }
      if (out.length > 100)
        throw Error('Action list exceeds bound; inspect the previous conversation');
      return out;
    },
    /** Persist only the exact user decision; source verification and effects remain in apply. */
    async admit(/** @type {any} */ input, /** @type {any} */ request) {
      validateApproval(input);
      const a = await access(request),
        dir = await folder(a.scope, input.conversationId, false);
      if (!dir) throw Error('Exact reviewed action unavailable');
      const path = join(dir, input.actionId + '.json');
      return withChatLock(path, async () => {
        const j = await load(path, a.scope);
        if (j.digest !== input.digest || j.proposal.conversationId !== input.conversationId)
          throw Error('Reviewed action digest or conversation differs');
        j.approvalDigest = input.digest;
        j.approvalState = 'queued';
        await save(path, j);
        return view(j);
      });
    },
    async markUnconfirmed(/** @type {any} */ input, /** @type {any} */ request) {
      validateApproval(input);
      const a = await access(request),
        dir = await folder(a.scope, input.conversationId, false);
      if (!dir) throw Error('Exact reviewed action unavailable');
      const path = join(dir, input.actionId + '.json');
      return withChatLock(path, async () => {
        const j = await load(path, a.scope);
        if (j.digest !== input.digest || j.approvalDigest !== input.digest)
          throw Error('Exact approved action required');
        j.approvalState = 'unconfirmed';
        await save(path, j);
        return view(j);
      });
    },
    async apply(/** @type {any} */ input, /** @type {any} */ request) {
      validateApproval(input);
      let a = await access(request);
      const dir = await folder(a.scope, input.conversationId, false);
      if (!dir) throw Error('Exact reviewed action unavailable');
      const path = join(dir, input.actionId + '.json');
      return withChatLock(path, async () => {
        const j = await load(path, a.scope);
        if (j.digest !== input.digest || j.proposal.conversationId !== input.conversationId)
          throw Error('Reviewed action digest or conversation differs');
        const record = {
            id: j.proposal.actionId,
            homeId: a.scope.homeId,
            ...j.proposal.draft,
            ...(j.proposal.draft.kind === 'fact'
              ? { baseRevision: j.proposal.baseline.revision }
              : {}),
            authorUserId: a.scope.principalId,
            recordedAt: j.proposal.recordedAt
          },
          bytes = Buffer.from(canonicalJSON(record)),
          remote = a.scope.root + '/contributions/' + record.id + '-' + sha(record) + '.json';
        let io = ioFor(a),
          existing = await io.read(remote);
        if (existing) {
          if (!Buffer.from(existing).equals(bytes)) throw Error('Saved action content differs');
          j.state = 'confirmed';
          await save(path, j);
        } else if (j.state === 'pending') return view(j);
        else if (j.state === 'confirmed') throw Error('Confirmed contribution unavailable');
        else {
          a = await fresh(j, request);
          io = ioFor(a);
          j.state = 'pending';
          await save(path, j);
          try {
            await io.write(remote, bytes, 'application/json', async () => {
              await fresh(j, request);
            });
          } catch {}
          existing = await io.read(remote);
          if (!existing) return view(j);
          if (!Buffer.from(existing).equals(bytes)) throw Error('Saved action readback differs');
          j.state = 'confirmed';
          await save(path, j);
        }
        if (j.result?.status === 'accepted') return view(j);
        const publicationContext = structuredClone({
          digest: j.digest,
          proposal: j.proposal
        });
        if (j.result?.status === 'publication-pending') {
          // Recovery is read-only and must resolve the same immutable publication intent.
          if (!resolvePublication) return view(j);
          const resolved = await resolvePublication(
            record,
            await access(request),
            publicationContext
          );
          if (!resolved) return view(j);
          j.result = resolved;
        } else {
          a = await fresh(j, request);
          if (a.scope.role === 'maintainer' && publish) {
            j.result = { status: 'publication-pending' };
            await save(path, j);
            try {
              j.result = await publish(record, a, publicationContext);
            } catch {
              return view(j);
            }
          } else j.result = { status: 'submitted' };
        }
        if (
          !j.result ||
          !['accepted', 'submitted', 'held-for-review', 'publication-pending'].includes(
            j.result.status
          )
        )
          throw Error('Publication result unconfirmed');
        /** @type {any} */ const result = { status: j.result.status };
        if (j.result.revision !== undefined) {
          if (!Number.isSafeInteger(j.result.revision) || j.result.revision < 0)
            throw Error('Publication revision unconfirmed');
          result.revision = j.result.revision;
        }
        j.result = result;
        await save(path, j);
        return view(j);
      });
    }
  };
}
