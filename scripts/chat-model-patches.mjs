import { mkdir, lstat, readFile, open, readdir, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateModelPatch, buildModelPatchCandidate } from '../src/lib/home/model-patch.js';
import { validateBuilding } from '../src/lib/home/representative-building.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { assertExternalState } from './maintainer-journal.mjs';
import { withChatLock } from './chat-lock.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = /^[a-f0-9]{64}$/;
const sha = (/** @type {any} */ x) => createHash('sha256').update(canonicalJSON(x)).digest('hex');
const missing = (/** @type {any} */ e) => e?.code === 'ENOENT';
const binding = (/** @type {any} */ s) => ({
  homeId: s.homeId,
  principalId: s.principalId,
  ownerUserId: s.ownerUserId,
  root: s.root
});
/** @param {any} x @param {string[]} keys */
const exact = (x, keys) =>
  x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((k) => keys.includes(k));
const identity = (/** @type {any} */ b, /** @type {any} */ context, /** @type {any} */ draft) => {
  const hash = sha({ binding: b, ...context, draft });
  return (
    hash.slice(0, 8) +
    '-' +
    hash.slice(8, 12) +
    '-5' +
    hash.slice(13, 16) +
    '-8' +
    hash.slice(17, 20) +
    '-' +
    hash.slice(20, 32)
  );
};
/** Private model proposals and exact owner decisions. No cloud IO, publisher or rollback capability.
 * Authority and original verification come from the current authenticated request.
 * @param {any} options */
export async function createChatModelPatches({
  directory,
  authorize,
  verifySources,
  secretsFor = () => []
}) {
  directory = resolve(directory);
  async function dir(/** @type {string} */ path, create = false) {
    try {
      const s = await lstat(path);
      if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
        throw Error('Private model review directory required');
      return path;
    } catch (e) {
      if (!missing(e)) throw e;
      if (!create) return null;
      await mkdir(path, { mode: 0o700 });
      return dir(path);
    }
  }
  // The caller supplies an existing private state parent, never a model-controlled path.
  await dir(directory, true);
  assertExternalState(directory, fileURLToPath(new URL('../', import.meta.url)));
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
      !['maintainer', 'contributor'].includes(scope.role) ||
      a.home?.id !== scope.homeId ||
      a.home.ownerUserId !== scope.ownerUserId ||
      !Number.isSafeInteger(a.home.revision) ||
      a.home.revision < 1 ||
      typeof a.fileVersion !== 'string' ||
      !a.fileVersion ||
      a.fileVersion.length > 500 ||
      Buffer.byteLength(JSON.stringify(a.home)) > 2 * 1024 * 1024
    )
      throw Error('Current model contribution role and bounded home required');
    return { ...a, scope, home: structuredClone(a.home), token: request.token };
  }
  const base = (/** @type {any} */ a) => ({
    revision: a.home.revision,
    fileVersion: a.fileVersion,
    homeDigest: sha(a.home),
    modelDigest: sha(a.home.reconstruction?.buildingModel ?? null)
  });
  async function folders(
    /** @type {any} */ scope,
    /** @type {string} */ conversationId,
    create = false
  ) {
    if (!uuid.test(conversationId)) throw Error('Choose a model conversation');
    if (!(await dir(directory))) throw Error('Private model state unavailable');
    const home = await dir(join(directory, scope.homeId), create);
    if (!home) return null;
    const actor = await dir(join(home, scope.principalId), create);
    if (!actor) return null;
    const conversation = await dir(join(actor, conversationId));
    return { actor, conversation };
  }
  async function sourceChecks(/** @type {any} */ draft, /** @type {any} */ a) {
    const rows = await verifySources(draft.sourceIds, a);
    if (
      !Array.isArray(rows) ||
      rows.length !== draft.sourceIds.length ||
      rows.some(
        (x) => !exact(x, ['id', 'sha256']) || !draft.sourceIds.includes(x.id) || !hex.test(x.sha256)
      ) ||
      new Set(rows.map((x) => x.id)).size !== rows.length
    )
      throw Error('Original source verification incomplete');
    return rows
      .map((x) => ({ id: x.id, sha256: x.sha256 }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async function fresh(/** @type {any} */ initial, /** @type {any} */ request) {
    const a = await access(request);
    if (
      canonicalJSON(binding(a.scope)) !== canonicalJSON(binding(initial.scope)) ||
      canonicalJSON(base(a)) !== canonicalJSON(base(initial))
    )
      throw Error('Home or authority changed during model preparation');
    return a;
  }
  async function load(
    /** @type {string} */ path,
    /** @type {any} */ scope,
    /** @type {string} */ conversationId,
    staged = false
  ) {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 32768)
      throw Error('Private bounded model proposal required');
    const j = JSON.parse(await readFile(path, 'utf8')),
      p = j.proposal;
    if (
      !exact(j, ['schema', 'proposal', 'digest']) ||
      j.schema !== 1 ||
      !exact(p, [
        'binding',
        'actionId',
        'conversationId',
        'turnId',
        'draft',
        'baseline',
        'sources',
        'changes',
        'recordedAt'
      ]) ||
      canonicalJSON(p.binding) !== canonicalJSON(binding(scope)) ||
      sha(p) !== j.digest ||
      !uuid.test(p.conversationId) ||
      p.conversationId !== conversationId ||
      !uuid.test(p.turnId) ||
      identity(p.binding, { conversationId: p.conversationId, turnId: p.turnId }, p.draft) !==
        p.actionId ||
      path !== join(dirname(path), p.actionId + (staged ? '.json.tmp' : '.json')) ||
      !exact(p.baseline, ['revision', 'fileVersion', 'homeDigest', 'modelDigest']) ||
      !Number.isSafeInteger(p.baseline.revision) ||
      p.baseline.revision < 1 ||
      typeof p.baseline.fileVersion !== 'string' ||
      !p.baseline.fileVersion ||
      p.baseline.fileVersion.length > 500 ||
      !hex.test(p.baseline.homeDigest) ||
      !hex.test(p.baseline.modelDigest) ||
      typeof p.recordedAt !== 'string' ||
      p.recordedAt.length > 100 ||
      !Number.isFinite(Date.parse(p.recordedAt))
    )
      throw Error('Model proposal integrity or scope differs');
    const draft = validateModelPatch(p.draft),
      changes = draft.edits.map((/** @type {any} */ e) => ({
        target: e.target,
        wallId: e.wallId,
        openingId: e.openingId,
        field: e.field,
        before: e.expected,
        after: e.value,
        units: 'feet'
      }));
    if (
      canonicalJSON(draft) !== canonicalJSON(p.draft) ||
      canonicalJSON(changes) !== canonicalJSON(p.changes) ||
      !Array.isArray(p.sources) ||
      p.sources.length !== draft.sourceIds.length ||
      p.sources.some(
        (/** @type {any} */ x) =>
          !exact(x, ['id', 'sha256']) || !draft.sourceIds.includes(x.id) || !hex.test(x.sha256)
      ) ||
      new Set(p.sources.map((/** @type {any} */ x) => x.id)).size !== p.sources.length
    )
      throw Error('Model proposal content differs');
    return j;
  }
  async function view(/** @type {any} */ j, /** @type {any} */ a) {
    const decision = await readDecision(
      join(
        directory,
        a.scope.homeId,
        a.scope.principalId,
        j.proposal.conversationId,
        j.proposal.actionId + '.decision.json'
      ),
      j
    );
    return {
      kind: 'model-patch',
      actionId: j.proposal.actionId,
      digest: j.digest,
      conversationId: j.proposal.conversationId,
      turnId: j.proposal.turnId,
      note: j.proposal.draft.note,
      sourceIds: [...j.proposal.draft.sourceIds],
      sourceChecks: structuredClone(j.proposal.sources),
      baseRevision: j.proposal.baseline.revision,
      changes: structuredClone(j.proposal.changes),
      majorReviewRequired: true,
      status:
        canonicalJSON(base(a)) === canonicalJSON(j.proposal.baseline)
          ? decision
            ? 'model-approval-recorded'
            : 'needs-model-review'
          : 'stale-model',
      ...(decision ? { approvalRecorded: true, approvedAt: decision.j.decision.decidedAt } : {}),
      sourceVerification: 'prepared-version-only'
    };
  }
  async function readDecision(/** @type {string} */ path, /** @type {any} */ proposal) {
    let found = null;
    for (const staged of [false, true]) {
      try {
        const name = path + (staged ? '.tmp' : ''),
          st = await lstat(name);
        if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 4096)
          throw Error('Private bounded model decision required');
        const j = JSON.parse(await readFile(name, 'utf8')),
          d = j.decision,
          p = proposal.proposal;
        if (
          !exact(j, ['schema', 'decision', 'digest']) ||
          j.schema !== 1 ||
          !exact(d, [
            'kind',
            'binding',
            'actionId',
            'conversationId',
            'proposalDigest',
            'decidedAt'
          ]) ||
          d.kind !== 'model-approval' ||
          canonicalJSON(d.binding) !== canonicalJSON(p.binding) ||
          d.actionId !== p.actionId ||
          d.conversationId !== p.conversationId ||
          d.proposalDigest !== proposal.digest ||
          typeof d.decidedAt !== 'string' ||
          d.decidedAt.length > 100 ||
          !Number.isFinite(Date.parse(d.decidedAt)) ||
          sha(d) !== j.digest
        )
          throw Error('Model decision integrity or scope differs');
        if (found && canonicalJSON(found.j) !== canonicalJSON(j))
          throw Error('Conflicting model decision stage requires review');
        found ??= { j, staged, path };
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    return found;
  }
  function requireOwner(/** @type {any} */ a) {
    if (a.scope.role !== 'maintainer' || a.scope.principalId !== a.scope.ownerUserId)
      throw Error('Current designated owner required for model approval');
  }
  async function existing(
    /** @type {any} */ a,
    /** @type {any} */ context,
    /** @type {string} */ actionId
  ) {
    const f = await folders(a.scope, context.conversationId);
    if (!f?.conversation) return null;
    const path = join(f.conversation, actionId + '.json');
    for (const staged of [false, true]) {
      try {
        return {
          j: await load(path + (staged ? '.tmp' : ''), a.scope, context.conversationId, staged),
          staged,
          path,
          actor: f.actor
        };
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    return null;
  }
  async function promote(/** @type {string} */ path) {
    const f = await open(path + '.tmp', 'r');
    try {
      await f.sync();
    } finally {
      await f.close();
    }
    await link(path + '.tmp', path);
    await unlink(path + '.tmp');
    const parent = await open(dirname(path), 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  async function recover(
    /** @type {any} */ old,
    /** @type {any} */ a,
    /** @type {any} */ context,
    /** @type {string} */ actionId,
    /** @type {any} */ request
  ) {
    if (!old.staged) return view(old.j, a);
    return withChatLock(join(old.actor, '.capacity'), async () => {
      const current = await fresh(a, request),
        saved = await existing(current, context, actionId);
      if (!saved) throw Error('Exact interrupted model proposal unavailable');
      if (saved.staged) await promote(saved.path);
      return view(saved.j, current);
    });
  }
  async function capacity(/** @type {string} */ actor) {
    const names = await readdir(actor);
    let count = 0;
    const conversations = [];
    for (const n of names) {
      if (['.capacity.coord.sqlite', '.capacity.coord.sqlite-journal'].includes(n)) {
        let s;
        try {
          s = await lstat(join(actor, n));
        } catch (e) {
          if (n.endsWith('-journal') && missing(e)) continue;
          throw e;
        }
        if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077)
          throw Error('Model capacity discovery incomplete');
        continue;
      }
      if (!uuid.test(n) || !(await dir(join(actor, n))))
        throw Error('Model capacity discovery incomplete');
      conversations.push(n);
      const retained = new Set(),
        decisions = new Set();
      for (const f of await readdir(join(actor, n))) {
        const decision = /^([a-f0-9-]{36})\.decision\.json(?:\.tmp)?$/i.exec(f);
        if (decision && uuid.test(decision[1])) {
          let st;
          try {
            st = await lstat(join(actor, n, f));
          } catch (e) {
            if (f.endsWith('.tmp') && missing(e)) continue;
            throw e;
          }
          if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 4096)
            throw Error('Private bounded model decision required');
          decisions.add(decision[1]);
          continue;
        }
        const staged = f.endsWith('.json.tmp'),
          id = f.slice(0, staged ? -9 : -5);
        if (!uuid.test(id) || (!staged && !f.endsWith('.json')))
          throw Error('Model proposal discovery incomplete');
        if (staged) {
          let st;
          try {
            st = await lstat(join(actor, n, f));
          } catch (e) {
            if (missing(e)) continue;
            throw e;
          }
          if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 32768)
            throw Error('Private bounded model staging file required');
        }
        retained.add(id);
      }
      if ([...decisions].some((id) => !retained.has(id)))
        throw Error('Orphan model decision needs review');
      count += retained.size;
    }
    if (conversations.length > 30 || count > 50) throw Error('Model retained capacity exceeded');
    return { conversations, count };
  }
  async function save(/** @type {string} */ path, /** @type {any} */ j) {
    const raw = JSON.stringify(j);
    if (Buffer.byteLength(raw) > 32768) throw Error('Model proposal exceeds byte limit');
    const tmp = path + '.tmp',
      f = await open(tmp, 'wx', 0o600);
    try {
      await f.writeFile(raw);
      await f.sync();
    } finally {
      await f.close();
    }
    // The exact complete stage can be recovered after a crash; partial bytes are held.
    await promote(path);
  }
  return {
    async prepare(
      /** @type {any} */ input,
      /** @type {any} */ context,
      /** @type {any} */ request
    ) {
      const a = await access(request),
        draft = validateModelPatch(input);
      if (
        !exact(context, ['conversationId', 'turnId']) ||
        !uuid.test(context.conversationId) ||
        !uuid.test(context.turnId)
      )
        throw Error('Current model conversation required');
      context = {
        conversationId: context.conversationId.toLowerCase(),
        turnId: context.turnId.toLowerCase()
      };
      const raw = JSON.stringify(draft);
      if (
        [request.token, ...secretsFor(a.scope)].some(
          (s) => typeof s === 'string' && s.length >= 8 && raw.includes(s)
        ) ||
        /sk-ant-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}/.test(raw)
      )
        throw Error('Credentials cannot be saved in a model proposal');
      const actionId = identity(binding(a.scope), context, draft),
        old = await existing(a, context, actionId);
      if (old) return recover(old, a, context, actionId, request);
      const { changes } = buildModelPatchCandidate(a.home, draft),
        sources = await sourceChecks(draft, a);
      await fresh(a, request);
      const folder = await folders(a.scope, context.conversationId, true);
      if (!folder) throw Error('Private model actor required');
      return withChatLock(join(folder.actor, '.capacity'), async () => {
        const current = await fresh(a, request),
          prior = await existing(current, context, actionId);
        if (prior) {
          if (prior.staged) await promote(prior.path);
          return view(prior.j, current);
        }
        const cap = await capacity(folder.actor);
        if (
          cap.count >= 50 ||
          (!cap.conversations.includes(context.conversationId) && cap.conversations.length >= 30)
        )
          throw Error('Retained model capacity reached; inspect existing reviews');
        const proposal = {
            binding: binding(a.scope),
            actionId,
            ...context,
            draft,
            baseline: base(a),
            sources,
            changes,
            recordedAt: new Date().toISOString()
          },
          j = { schema: 1, proposal, digest: sha(proposal) };
        const conversation = await dir(join(folder.actor, context.conversationId), true);
        if (!conversation) throw Error('Private model conversation unavailable');
        const last = await fresh(a, request);
        await save(join(conversation, actionId + '.json'), j);
        return view(j, last);
      });
    },
    /** Explicit human-only approval; never registered as a model tool and does not publish geometry. */
    async approve(/** @type {any} */ input, /** @type {any} */ request) {
      if (
        !exact(input, ['actionId', 'conversationId', 'digest']) ||
        !uuid.test(input.actionId) ||
        !uuid.test(input.conversationId) ||
        !hex.test(input.digest)
      )
        throw Error('Exact reviewed model proposal required');
      const a = await access(request);
      requireOwner(a);
      const f = await folders(a.scope, input.conversationId);
      if (!f?.conversation) throw Error('Saved model proposal unavailable');
      const conversation = f.conversation;
      return withChatLock(join(f.actor, '.capacity'), async () => {
        const j = await load(
          join(conversation, input.actionId + '.json'),
          a.scope,
          input.conversationId
        );
        if (j.digest !== input.digest) throw Error('Reviewed model digest differs');
        const path = join(conversation, input.actionId + '.decision.json'),
          old = await readDecision(path, j);
        const current = await access(request);
        requireOwner(current);
        if (canonicalJSON(binding(current.scope)) !== canonicalJSON(j.proposal.binding))
          throw Error('Model owner scope changed');
        if (old) {
          if (old.staged) await promote(path);
          return view(j, current);
        }
        if (canonicalJSON(base(current)) !== canonicalJSON(j.proposal.baseline))
          throw Error('Model baseline changed; prepare a new review');
        const sources = await sourceChecks(j.proposal.draft, current);
        if (canonicalJSON(sources) !== canonicalJSON(j.proposal.sources))
          throw Error('Reviewed original changed');
        const last = await fresh(current, request);
        requireOwner(last);
        buildModelPatchCandidate(last.home, j.proposal.draft);
        const decision = {
          kind: 'model-approval',
          binding: j.proposal.binding,
          actionId: j.proposal.actionId,
          conversationId: j.proposal.conversationId,
          proposalDigest: j.digest,
          decidedAt: new Date().toISOString()
        };
        await save(path, { schema: 1, decision, digest: sha(decision) });
        return view(j, last);
      });
    },
    /** Server-only historical approval load. Does not assert a current publication baseline or perform IO effects. */
    async readApproved(/** @type {any} */ input, /** @type {any} */ request) {
      if (
        !exact(input, ['actionId', 'conversationId', 'digest']) ||
        !uuid.test(input.actionId) ||
        !uuid.test(input.conversationId) ||
        !hex.test(input.digest)
      )
        throw Error('Exact reviewed model proposal required');
      const a = await access(request);
      requireOwner(a);
      const f = await folders(a.scope, input.conversationId);
      if (!f?.conversation) throw Error('Saved model proposal unavailable');
      const j = await load(
        join(f.conversation, input.actionId + '.json'),
        a.scope,
        input.conversationId
      );
      if (j.digest !== input.digest) throw Error('Reviewed model digest differs');
      const decision = await readDecision(
        join(f.conversation, input.actionId + '.decision.json'),
        j
      );
      if (!decision || decision.staged) throw Error('Finalized exact owner decision required');
      const last = await access(request);
      requireOwner(last);
      if (canonicalJSON(binding(last.scope)) !== canonicalJSON(j.proposal.binding))
        throw Error('Current owner decision scope changed');
      return structuredClone({ proposal: j.proposal, digest: j.digest, approval: decision.j });
    },
    /** Read-only, exact current-version display. Original receipts remain explicitly preparation-time only. */
    async preview(/** @type {any} */ input, /** @type {any} */ request) {
      if (
        !exact(input, ['actionId', 'conversationId', 'digest']) ||
        !uuid.test(input.actionId) ||
        !uuid.test(input.conversationId) ||
        !hex.test(input.digest)
      )
        throw Error('Exact reviewed model proposal required');
      const a = await access(request),
        f = await folders(a.scope, input.conversationId);
      if (!f?.conversation) throw Error('Saved model proposal unavailable');
      const j = await load(
        join(f.conversation, input.actionId + '.json'),
        a.scope,
        input.conversationId
      );
      if (j.digest !== input.digest) throw Error('Reviewed model digest differs');
      const current = await fresh(a, request);
      if (canonicalJSON(base(current)) !== canonicalJSON(j.proposal.baseline))
        throw Error('Saved model changed; prepare a new preview');
      const { candidate } = buildModelPatchCandidate(current.home, j.proposal.draft);
      // Normalization is for display only; the raw candidate and stored home are never replaced.
      const before = validateBuilding(current.home.reconstruction.buildingModel),
        after = validateBuilding(candidate.reconstruction.buildingModel);
      const wallIds = [...new Set(j.proposal.draft.edits.map((/** @type {any} */ e) => e.wallId))];
      const dimensions = (/** @type {any} */ wall) => ({
        heightFeet: wall.heightFeet,
        thicknessFeet: wall.thicknessFeet,
        openings: wall.openings.map((/** @type {any} */ o) => ({
          id: o.id,
          kind: o.kind,
          offsetFeet: o.offsetFeet,
          widthFeet: o.widthFeet,
          heightFeet: o.heightFeet,
          sillFeet: o.sillFeet
        }))
      });
      const boundedIdentity = (/** @type {any} */ id) =>
        typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,199}$/i.test(id);
      for (const id of wallIds) {
        const wall = current.home.reconstruction.buildingModel.walls.find(
          (/** @type {any} */ w) => w.id === id
        );
        if (
          !wall ||
          !boundedIdentity(wall.id) ||
          !boundedIdentity(wall.level) ||
          !Array.isArray(wall.openings ?? []) ||
          (wall.openings ?? []).some((/** @type {any} */ o) => !boundedIdentity(o.id)) ||
          new Set((wall.openings ?? []).map((/** @type {any} */ o) => o.id)).size !==
            (wall.openings ?? []).length
        )
          throw Error('Bounded unique model display identity required');
      }
      const walls = wallIds.map((id) => {
        const b = before.walls.find((w) => w.id === id),
          next = after.walls.find((w) => w.id === id);
        if (!b || !next) throw Error('Preview wall unavailable');
        return {
          id: b.id,
          start: b.start,
          end: b.end,
          before: dimensions(b),
          after: dimensions(next)
        };
      });
      const levelId = before.walls.find((w) => w.id === wallIds[0])?.level,
        level = before.levels.find((l) => l.id === levelId);
      const out = {
        review: await view(j, current),
        units: 'feet',
        geometryBasis: 'saved-model-display',
        levelId,
        levelElevationFeet: level?.elevationFeet,
        walls
      };
      if (Buffer.byteLength(JSON.stringify(out)) > 131072)
        throw Error('Model preview exceeds display bound; use a smaller correction');
      return out;
    },
    async list(/** @type {string} */ conversationId, /** @type {any} */ request) {
      if (!uuid.test(conversationId)) throw Error('Choose a model conversation');
      conversationId = conversationId.toLowerCase();
      const a = await access(request),
        f = await folders(a.scope, conversationId);
      if (!f?.conversation) return [];
      await capacity(f.actor);
      const out = [],
        names = await readdir(f.conversation);
      for (const name of names.filter((n) =>
        /^[a-f0-9-]{36}\.decision\.json(?:\.tmp)?$/i.test(n)
      )) {
        const id = name.slice(0, 36),
          saved = await existing(a, { conversationId }, id);
        if (!saved || saved.staged) throw Error('Approved model proposal needs exact recovery');
        await readDecision(join(f.conversation, id + '.decision.json'), saved.j);
      }
      for (const name of names) {
        if (/^[a-f0-9-]{36}\.decision\.json(?:\.tmp)?$/i.test(name)) continue;
        if (name.endsWith('.json.tmp') && uuid.test(name.slice(0, -9))) continue;
        if (!uuid.test(name.slice(0, -5)) || !name.endsWith('.json'))
          throw Error('Model discovery incomplete');
        out.push(await view(await load(join(f.conversation, name), a.scope, conversationId), a));
      }
      return out.sort((a, b) => a.actionId.localeCompare(b.actionId));
    }
  };
}
