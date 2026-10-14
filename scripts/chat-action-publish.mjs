import { readFile, lstat, mkdir, rmdir, open, rename, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
import { validateHomeAction } from '../src/lib/home/chat-action.js';
import { validateChatScope } from '../src/lib/home/chat-contract.js';
import { buildMaintainerCycle } from '../src/lib/home/maintainer-cycle.js';
import { persistCycle } from './maintainer-journal.mjs';
import { createCallerMaintainerClient } from './fulcra-ingest.mjs';
import { buildPublicationIntent } from './maintainer-publish.mjs';
import { runPublication } from './publication-journal.mjs';
import { validateSourceAdmissionDraft } from './chat-source-admission.mjs';
const hash = (/** @type {any} */ value) =>
  createHash('sha256').update(canonicalJSON(value)).digest('hex');
/** Current-token-only adapter to the existing designated maintainer journal.
 * No publication recovery path can upload bytes. @param {any} options */
export function createChatActionPublisher({
  directory,
  verifySources,
  sourceOnly = false,
  readSourceApproval,
  assertState = () => {},
  clientFor = createCallerMaintainerClient
}) {
  if (typeof sourceOnly !== 'boolean') throw Error('Explicit source-only adapter mode required');
  async function sourceDecision(
    /** @type {any} */ record,
    /** @type {any} */ access,
    /** @type {any} */ context
  ) {
    assertState();
    if (!sourceOnly) return;
    if (
      typeof readSourceApproval !== 'function' ||
      canonicalJSON(await readSourceApproval(record, access, context)) !== canonicalJSON(context)
    )
      throw Error('Exact persisted owner source decision required');
  }
  async function privateJSON(/** @type {string} */ path) {
    assertState();
    try {
      const st = await lstat(path);
      if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 4 * 1024 * 1024)
        throw Error('Private bounded publication state required');
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
      throw e;
    }
  }
  function approved(
    /** @type {any} */ record,
    /** @type {any} */ access,
    /** @type {any} */ context
  ) {
    const scope = validateChatScope(access.scope),
      p = context?.proposal;
    if (
      scope.role !== 'maintainer' ||
      scope.principalId !== scope.ownerUserId ||
      typeof access.token !== 'string' ||
      access.token.length < 8 ||
      !p ||
      hash(p) !== context.digest
    )
      throw Error('Exact current owner approval required');
    if (
      canonicalJSON(p.binding) !==
        canonicalJSON({
          homeId: scope.homeId,
          principalId: scope.principalId,
          ownerUserId: scope.ownerUserId,
          root: scope.root
        }) ||
      !p.baseline ||
      !Number.isSafeInteger(p.baseline.revision) ||
      typeof p.baseline.fileVersion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.baseline.homeDigest) ||
      !Array.isArray(p.sources)
    )
      throw Error('Reviewed home scope differs');
    const draft = sourceOnly
        ? validateSourceAdmissionDraft(p.draft, p.actionId)
        : validateHomeAction(p.draft),
      expected = {
        id: p.actionId,
        homeId: scope.homeId,
        ...(sourceOnly
          ? { kind: draft.kind, value: draft.value, attachment: draft.attachment }
          : draft),
        ...(draft.kind === 'fact' ? { baseRevision: p.baseline.revision } : {}),
        authorUserId: scope.principalId,
        recordedAt: p.recordedAt
      };
    if (
      (sourceOnly &&
        (p.kind !== 'source-admission' || p.sources[0]?.sha256 !== draft.attachment.sha256)) ||
      canonicalJSON(record) !== canonicalJSON(expected) ||
      p.sources.length !== draft.sourceIds.length ||
      new Set(p.sources.map((/** @type {any} */ s) => s.id)).size !== p.sources.length ||
      p.sources.some(
        (/** @type {any} */ s) =>
          !draft.sourceIds.includes(s.id) || !/^[a-f0-9]{64}$/.test(s.sha256)
      )
    )
      throw Error('Reviewed record or source proof differs');
    return {
      scope,
      p,
      sourceIds: draft.sourceIds,
      context,
      allowed: new Set([
        record.id,
        ...p.sources
          .filter((/** @type {any} */ s) => /^evidence-[a-f0-9-]{36}$/.test(s.id))
          .map((/** @type {any} */ s) => s.id.slice(9))
      ])
    };
  }
  function attributed(/** @type {any} */ row) {
    const { sourceUserId, ...value } = row;
    return value;
  }
  function identity(/** @type {any} */ input, /** @type {any} */ scope) {
    if (
      input.home.id !== scope.homeId ||
      input.home.ownerUserId !== scope.ownerUserId ||
      input.principalId !== scope.principalId ||
      input.root !== scope.root
    )
      throw Error('Current maintainer identity changed');
  }
  async function inspected(
    /** @type {any} */ input,
    /** @type {any} */ record,
    /** @type {any} */ access,
    /** @type {any} */ approval
  ) {
    const { scope, p, allowed } = approval;
    identity(input, scope);
    if (
      input.baselineVersion !== p.baseline.fileVersion ||
      input.home.revision !== p.baseline.revision ||
      hash(input.home) !== p.baseline.homeDigest ||
      input.unavailableMembers.length
    )
      throw Error('Current baseline or contribution discovery differs');
    const exact = input.rows.filter((/** @type {any} */ r) => r.id === record.id);
    if (
      exact.length !== 1 ||
      exact[0].sourceUserId !== scope.principalId ||
      canonicalJSON(attributed(exact[0])) !== canonicalJSON(record)
    )
      throw Error('Exact current-caller contribution required');
    const full = buildMaintainerCycle(input);
    if (!full.accepted.includes(record.id))
      throw Error('Contribution conflicts or requires review');
    for (const s of p.sources) {
      const accepted = input.home.sources?.filter((/** @type {any} */ x) => x.id === s.id) ?? [];
      if (accepted.length) {
        const check = input.sourceChecks?.filter((/** @type {any} */ x) => x.id === s.id) ?? [];
        if (
          accepted.length !== 1 ||
          check.length !== 1 ||
          check[0].status !== 'unchanged' ||
          check[0].currentSHA256 !== s.sha256
        )
          throw Error('Accepted original needs review');
      } else {
        const rows = input.rows.filter(
          (/** @type {any} */ r) => r.kind === 'evidence' && r.id === s.id.slice(9)
        );
        if (
          !s.id.startsWith('evidence-') ||
          rows.length !== 1 ||
          rows[0].sourceUserId !== scope.principalId ||
          rows[0].attachment?.sha256 !== s.sha256 ||
          !full.accepted.includes(rows[0].id)
        )
          throw Error('Uploaded original is not an exact verified source');
      }
    }
    const original = await verifySources(approval.sourceIds, {
      ...access,
      home: input.home,
      fileVersion: input.baselineVersion
    });
    const sorted = (/** @type {any[]} */ xs) =>
      [...xs].map((x) => ({ id: x.id, sha256: x.sha256 })).sort((a, b) => a.id.localeCompare(b.id));
    if (canonicalJSON(sorted(original)) !== canonicalJSON(sorted(p.sources)))
      throw Error('Reviewed original changed');
    await sourceDecision(record, access, approval.context);
    return { ...input, rows: input.rows.filter((/** @type {any} */ r) => allowed.has(r.id)) };
  }
  async function pendingIntent(/** @type {any} */ approval, recovery = false) {
    const pointer = await privateJSON(join(directory, 'publication.json'));
    if (!pointer || (pointer.status === 'confirmed' && !recovery)) return null;
    if (
      !['pending', 'confirmed'].includes(pointer.status) ||
      !/^[a-f0-9]{64}$/.test(pointer.intentId)
    )
      throw Error('Publication pointer unknown');
    const intent = await privateJSON(join(directory, 'publications', pointer.intentId + '.json'));
    if (!intent) throw Error('Pending publication missing');
    validateIntent(intent, approval);
    return intent;
  }
  function validateIntent(/** @type {any} */ intent, /** @type {any} */ approval) {
    const { intentId, ...payload } = intent;
    if (
      hash(payload) !== intentId ||
      hash(intent.target) !== intent.targetDigest ||
      hash(intent.base) !== intent.baseDigest ||
      intent.homeId !== approval.scope.homeId ||
      intent.principalId !== approval.scope.principalId ||
      intent.root !== approval.scope.root ||
      intent.baseDigest !== approval.p.baseline.homeDigest ||
      intent.baselineVersion !== approval.p.baseline.fileVersion ||
      !intent.accepted.includes(approval.p.actionId) ||
      intent.accepted.some((/** @type {string} */ id) => !approval.allowed.has(id))
    )
      throw Error('Pending publication belongs to a different review');
  }
  async function bindIntent(/** @type {any} */ approval, /** @type {any} */ intent) {
    assertState();
    validateIntent(intent, approval);
    const dir = join(directory, 'chat-publication-actions');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const st = await lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
      throw Error('Private approval association directory required');
    const digest = hash(approval.p),
      path = join(dir, digest + '.json'),
      value = { schema: 1, approvalDigest: digest, intentId: intent.intentId };
    const previous = await privateJSON(path);
    if (previous) {
      if (canonicalJSON(previous) !== canonicalJSON(value))
        throw Error('Immutable approval association differs');
      return;
    }
    const tmp = join(dir, '.association-' + randomUUID()),
      file = await open(tmp, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(tmp, path);
    } catch (e) {
      if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'EEXIST') throw e;
      if (canonicalJSON(await privateJSON(path)) !== canonicalJSON(value))
        throw Error('Immutable approval association collision');
    } finally {
      await unlink(tmp);
    }
    const folder = await open(dir, 'r');
    try {
      await folder.sync();
    } finally {
      await folder.close();
    }
  }
  async function associatedIntent(/** @type {any} */ approval) {
    const digest = hash(approval.p),
      index = await privateJSON(join(directory, 'chat-publication-actions', digest + '.json'));
    if (!index) return null;
    if (
      Object.keys(index).length !== 3 ||
      index.schema !== 1 ||
      index.approvalDigest !== digest ||
      !/^[a-f0-9]{64}$/.test(index.intentId)
    )
      throw Error('Approval association unknown');
    const intent = await privateJSON(join(directory, 'publications', index.intentId + '.json'));
    // An association reserves a review, not a publication receipt.
    if (!intent) return null;
    if (intent.intentId !== index.intentId) throw Error('Historical intent differs');
    validateIntent(intent, approval);
    return intent;
  }
  return {
    async publish(
      /** @type {any} */ record,
      /** @type {any} */ access,
      /** @type {any} */ context
    ) {
      /** @type {any} */ let approval, client, expectedIntent;
      try {
        await sourceDecision(record, access, context);
        approval = approved(record, access, context);
        client = clientFor(
          approval.scope.homeId,
          { root: approval.scope.root, checkSources: true, sourceMaxBytes: 200 * 1024 * 1024 },
          access.token
        );
        // Pending writes are resolved only by the separate read-only operation.
        if (await pendingIntent(approval)) return { status: 'publication-pending' };
        const full = await client.read();
        identity(full, approval.scope);
        assertState();
        persistCycle(directory, buildMaintainerCycle(full));
        const selected = await inspected(full, record, access, approval);
        expectedIntent = buildPublicationIntent(selected);
        if (!expectedIntent) throw Error('No reviewed publication candidate');
        await bindIntent(approval, expectedIntent);
      } catch {
        return { status: 'held-for-review' };
      }
      const transport = {
        ...client,
        read: async () => {
          assertState();
          const first = await client.read();
          assertState();
          identity(first, approval.scope);
          if (hash(first.home) !== approval.p.baseline.homeDigest) {
            if (hash(first.home) === expectedIntent.targetDigest) return first;
          }
          const selected = await inspected(first, record, access, approval);
          if (buildPublicationIntent(selected)?.intentId !== expectedIntent.intentId)
            throw Error('Inspected publication intent changed');
          // Authority and baseline are checked again after slow original hashing.
          const last = await client.read();
          identity(last, approval.scope);
          if (
            last.baselineVersion !== first.baselineVersion ||
            hash(last.home) !== hash(first.home) ||
            canonicalJSON(last.rows) !== canonicalJSON(first.rows) ||
            canonicalJSON(last.sourceChecks) !== canonicalJSON(first.sourceChecks) ||
            last.unavailableMembers.length
          )
            throw Error('Current authority or records changed during verification');
          return selected;
        },
        write: async (
          /** @type {string} */ path,
          /** @type {any} */ value,
          /** @type {any} */ beforeCommit
        ) =>
          client.write(path, value, async () => {
            await transport.read();
            if (beforeCommit) await beforeCommit();
            await sourceDecision(record, access, context);
            assertState();
          })
      };
      try {
        assertState();
        const result = await runPublication(directory, transport);
        if (!result?.confirmed) return { status: 'held-for-review' };
        return { status: 'accepted', revision: result.revision };
      } catch {
        try {
          if (await pendingIntent(approval)) return { status: 'publication-pending' };
        } catch {}
        return { status: 'held-for-review' };
      }
    },
    async resolvePublication(
      /** @type {any} */ record,
      /** @type {any} */ access,
      /** @type {any} */ context
    ) {
      await sourceDecision(record, access, context);
      const approval = approved(record, access, context);
      const lock = join(directory, '.cycle.lock');
      try {
        await mkdir(lock, { mode: 0o700 });
      } catch {
        return null;
      }
      try {
        const intent = await associatedIntent(approval);
        if (!intent) return null;
        const client = clientFor(
            approval.scope.homeId,
            { root: approval.scope.root, checkSources: true, sourceMaxBytes: 200 * 1024 * 1024 },
            access.token
          ),
          current = await client.read();
        identity(current, approval.scope);
        let confirmed = current.home;
        if (hash(confirmed) !== intent.targetDigest) {
          confirmed = await client.readSnapshot(
            approval.scope.root + '/history/' + intent.targetDigest + '.json'
          );
          if (!confirmed || hash(confirmed) !== intent.targetDigest) return null;
        }
        const matches =
          confirmed.contributionEvidence?.filter((/** @type {any} */ r) => r.id === record.id) ??
          [];
        if (matches.length !== 1 || canonicalJSON(attributed(matches[0])) !== canonicalJSON(record))
          throw Error('Accepted record readback differs');
        await sourceDecision(record, access, context);
        // Confirm only local journal state under the existing maintainer lock; no remote upload.
        const pointer = await privateJSON(join(directory, 'publication.json'));
        if (pointer?.intentId === intent.intentId && pointer.status === 'pending') {
          const temp = join(directory, '.publication-' + randomUUID() + '.json');
          const file = await open(temp, 'wx', 0o600);
          try {
            await file.writeFile(
              JSON.stringify({
                ...pointer,
                status: 'confirmed',
                result: {
                  confirmed: true,
                  reused: true,
                  intentId: intent.intentId,
                  revision: intent.target.revision
                }
              })
            );
            await file.sync();
          } finally {
            await file.close();
          }
          await rename(temp, join(directory, 'publication.json'));
          const dir = await open(directory, 'r');
          try {
            await dir.sync();
          } finally {
            await dir.close();
          }
        }
        return { status: 'accepted', revision: intent.target.revision };
      } finally {
        await rmdir(lock);
      }
    }
  };
}
