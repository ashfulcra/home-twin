import { mkdir, lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chatTranscriptArchive, chatSourceReader } from './chat-storage.mjs';
import { persistentChatJournal } from './chat-journal.mjs';
import { runChatTurn } from './chat-runtime.mjs';
import { loadHouseModels } from './chat-model-settings.mjs';
import { createChatHomeTools } from './chat-home-tools.mjs';
import { createChatUploads } from './chat-uploads.mjs';
import { createChatModelPatches } from './chat-model-patches.mjs';
import { createChatActions } from './chat-actions.mjs';
import { chatActionSourceVerifier } from './chat-action-sources.mjs';
import { createChatActionPublisher } from './chat-action-publish.mjs';
import { assertExternalState } from './maintainer-journal.mjs';
import { chatFileClient } from './chat-file-client.mjs';
import { processChatFile, processChatText } from './chat-file-processing.mjs';
import { accessFulcraClient } from './access-fulcra-client.mjs';
import { homeRole } from '../src/lib/home/access.js';
import { validateChatScope, validateChatTurn } from '../src/lib/home/chat-contract.js';
/** Persistent ordinary worker; browser disconnect does not cancel the job. @param {any} options */
export async function createChatWorker({
  directory,
  authorize,
  model,
  modelFor,
  readSource,
  archive,
  uploads,
  actions,
  actionsFor,
  modelReviews,
  modelReviewsFor
}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink() || root.mode & 0o077)
    throw Error('Private chat runtime directory required');
  /** @type {Map<string,Promise<any>>} */ const journals = new Map();
  /** @type {Map<string,any>} */ const active = new Map();
  /** @type {Map<string,any>} */ const recordJobs = new Map();
  async function bind(/** @type {any} */ input) {
    if (
      typeof input.token !== 'string' ||
      input.token.length < 8 ||
      input.token.length > 16384 ||
      typeof input.homeId !== 'string'
    )
      throw Error('Current caller required');
    const access = await authorize({ token: input.token, homeId: input.homeId });
    const scope = validateChatScope(access.scope);
    if (scope.homeId !== input.homeId) throw Error('Home scope differs');
    return { ...access, scope };
  }
  async function journalFor(/** @type {any} */ scope) {
    const key = scope.homeId + '/' + scope.principalId;
    if (!journals.has(key)) {
      journals.set(
        key,
        (async () => {
          const journal = await persistentChatJournal(
            join(directory, scope.homeId, scope.principalId),
            scope
          );
          await journal.recover();
          return journal;
        })()
      );
    }
    const waiting = journals.get(key);
    try {
      return await waiting;
    } catch (e) {
      if (journals.get(key) === waiting) journals.delete(key);
      throw e;
    }
  }
  const jobKey = (/** @type {any} */ scope, /** @type {string} */ id) =>
    scope.homeId + '/' + scope.principalId + '/' + id;
  return {
    async idle() {
      await Promise.all([...active.values(), ...recordJobs.values()].map((x) => x.promise));
    },
    /** @param {any} request */ async dispatch(request) {
      if (
        !request ||
        typeof request !== 'object' ||
        Array.isArray(request) ||
        Object.keys(request).some(
          (k) => !['token', 'homeId', 'action', 'input', 'conversationId', 'cursor'].includes(k)
        )
      )
        throw Error('Unsupported chat service fields');
      const access = await bind(request),
        scope = access.scope;
      const selectedModel = modelFor ? modelFor(scope.homeId) : model;
      const selectedActions = actionsFor ? actionsFor(scope.homeId) : actions;
      const selectedReviews = modelReviewsFor ? modelReviewsFor(scope.homeId) : modelReviews;
      if (request.action === 'status')
        return {
          available: !!selectedModel,
          ...(uploads ? { uploads: ['maintainer', 'contributor'].includes(scope.role) } : {}),
          ...(selectedReviews
            ? { modelReviews: ['maintainer', 'contributor'].includes(scope.role) }
            : {}),
          ...(selectedActions
            ? { recordActions: ['maintainer', 'contributor'].includes(scope.role) }
            : {})
        };
      if (request.action === 'file') {
        if (
          !uploads ||
          !request.input ||
          Object.keys(request.input).length !== 2 ||
          !['prepare', 'status', 'chunk', 'finish'].includes(request.input.operation)
        )
          throw Error('File operation unavailable');
        return uploads[request.input.operation](request.input.value, {
          token: request.token,
          homeId: scope.homeId
        });
      }
      const journal = await journalFor(scope);
      if (request.action === 'preview-model') {
        if (!selectedReviews || !['maintainer', 'contributor'].includes(scope.role))
          throw Error('Current model contribution role required');
        if (!request.input?.conversationId) throw Error('Exact model review required');
        await journal.readConversation(request.input.conversationId);
        return selectedReviews.preview(request.input, {
          token: request.token,
          homeId: scope.homeId
        });
      }
      if (request.action === 'apply-record') {
        if (!selectedActions || !['maintainer', 'contributor'].includes(scope.role))
          throw Error('Current contribution role required');
        if (!request.input || !request.input.conversationId)
          throw Error('Exact record review required');
        await journal.readConversation(request.input.conversationId);
        if (active.has(jobKey(scope, request.input.conversationId)))
          throw Error('Wait for the reply before saving this record');
        const input = request.input;
        const key = jobKey(scope, input.conversationId) + '/' + input.actionId;
        const existing = recordJobs.get(key);
        if (existing) {
          if (JSON.stringify(existing.input) !== JSON.stringify(input))
            throw Error('Changed approval intent');
          await existing.admission;
          return { ...existing.approval, operation: { active: true } };
        }
        if (recordJobs.size >= 8) throw Error('Record worker busy; check the same decision later');
        const current = { token: request.token, homeId: scope.homeId };
        /** @type {any} */ const job = {
          input: structuredClone(input),
          admission: null,
          approval: null,
          promise: null
        };
        recordJobs.set(key, job);
        job.admission = selectedActions.admit(input, current);
        try {
          job.approval = await job.admission;
        } catch (e) {
          recordJobs.delete(key);
          throw e;
        }
        if (['accepted', 'submitted', 'held-for-review'].includes(job.approval.status)) {
          recordJobs.delete(key);
          return job.approval;
        }
        job.promise = (async () => {
          try {
            return await selectedActions.apply(input, current);
          } catch {
            try {
              await selectedActions.markUnconfirmed(input, current);
            } catch {}
          } finally {
            recordJobs.delete(key);
          }
        })();
        return { ...job.approval, operation: { active: true } };
      }
      if (request.action === 'turn') {
        if (!selectedModel) throw Error('Model is not configured');
        const input = validateChatTurn(request.input),
          key = jobKey(scope, input.conversationId);
        if (
          [request.token, ...(selectedModel.secrets ?? [])].some((secret) =>
            input.message.includes(secret)
          )
        )
          throw Error('Credentials cannot be sent in chat');
        if (active.has(key)) {
          const running = active.get(key);
          if (running.input.turnId !== input.turnId) throw Error('Conversation already active');
          if (JSON.stringify(running.input) !== JSON.stringify(input))
            throw Error('Changed turn intent');
          await running.admission;
          return { status: 'running', conversationId: input.conversationId, turnId: input.turnId };
        }
        if (active.size >= 8) throw Error('Chat worker busy; retry same turn');
        const controller = new AbortController();
        const reauthorize = async () => {
          const fresh = await bind(request);
          return {
            ...fresh,
            token: request.token,
            role: fresh.scope.role,
            userId: fresh.scope.principalId,
            ownerUserId: fresh.scope.ownerUserId,
            root: fresh.scope.root
          };
        };
        const tools = createChatHomeTools({
          authorize: reauthorize,
          readSource,
          prepareAction:
            selectedActions && ['maintainer', 'contributor'].includes(scope.role)
              ? async (/** @type {any} */ draft) =>
                  selectedActions.prepare(
                    draft,
                    { conversationId: input.conversationId, turnId: input.turnId },
                    { token: request.token, homeId: scope.homeId }
                  )
              : undefined,
          prepareModelPatch:
            selectedReviews && ['maintainer', 'contributor'].includes(scope.role)
              ? async (/** @type {any} */ draft) =>
                  selectedReviews.prepare(
                    draft,
                    { conversationId: input.conversationId, turnId: input.turnId },
                    { token: request.token, homeId: scope.homeId }
                  )
              : undefined,
          uploadedSource: uploads
            ? async (
                /** @type {string} */ id,
                /** @type {any} */ access,
                /** @type {number[]} */ pages
              ) => {
                const original = await uploads.source(id, {
                  token: request.token,
                  homeId: scope.homeId
                });
                if (!original) return null;
                const value = {
                  id,
                  title: original.source.title,
                  sha256: original.source.attachment.sha256,
                  originalAvailable: true
                };
                if (original.source.attachment.mimeType === 'text/plain')
                  return {
                    ...value,
                    ...processChatText(original.bytes)
                  };
                return {
                  ...value,
                  ...(await processChatFile(
                    original.bytes,
                    original.source.attachment.mimeType,
                    pages
                  ))
                };
              }
            : undefined
        });
        const job = /** @type {any} */ ({ input, turnId: input.turnId, controller, promise: null });
        active.set(key, job);
        job.admission = journal.createTurn(input);
        let admission;
        try {
          admission = await job.admission;
        } catch (e) {
          active.delete(key);
          throw e;
        }
        job.promise = (async () => {
          try {
            const result = await runChatTurn({
              journal,
              reserved: admission.created,
              scope,
              input,
              authorize: async () => (await reauthorize()).scope,
              model: selectedModel,
              tools,
              signal: controller.signal,
              secrets: [request.token, ...(selectedModel.secrets ?? [])]
            });
            if (archive) {
              await reauthorize();
              const conversation = await journal.readConversation(input.conversationId);
              await archive(conversation, {
                token: request.token,
                scope,
                conversationId: input.conversationId,
                authorize: reauthorize
              });
            }
            return result;
          } catch {
            return { status: 'archive-unconfirmed' };
          } finally {
            active.delete(key);
          }
        })();
        return { status: 'running', conversationId: input.conversationId, turnId: input.turnId };
      }
      if (request.action === 'events') {
        const record = await journal.readConversation(request.conversationId);
        return {
          events: await journal.readEvents(request.conversationId, request.cursor ?? 0),
          turns: record.turns,
          ...(selectedActions
            ? {
                actions: ['maintainer', 'contributor'].includes(scope.role)
                  ? (
                      await selectedActions.list(request.conversationId, {
                        token: request.token,
                        homeId: scope.homeId
                      })
                    ).map((/** @type {any} */ action) => ({
                      ...action,
                      operation: {
                        active: recordJobs.has(
                          jobKey(scope, request.conversationId) + '/' + action.actionId
                        )
                      }
                    }))
                  : []
              }
            : {}),
          ...(selectedReviews
            ? {
                modelReviews: ['maintainer', 'contributor'].includes(scope.role)
                  ? await selectedReviews.list(request.conversationId, {
                      token: request.token,
                      homeId: scope.homeId
                    })
                  : []
              }
            : {}),
          storage: archive
            ? await archive.status({ scope, conversationId: request.conversationId })
            : { state: 'local' }
        };
      }
      if (request.action === 'cancel') {
        const key = jobKey(scope, request.conversationId),
          job = active.get(key);
        if (job) job.controller.abort();
        const record = await journal.readConversation(request.conversationId),
          turn = record.turns.at(-1);
        if (!turn) throw Error('No active turn');
        return await journal.cancel(turn.input);
      }
      throw Error('Unsupported chat service action');
    }
  };
}
/** Server-only current caller resolver; no CLI credentials or client-supplied authority. @param {any} config */
export function configuredChatAccess(config) {
  return async (/** @type {any} */ { token, homeId }) => {
    const target = config.homes.find((/** @type {any} */ h) => h.homeId === homeId);
    if (!target) throw Error('Home chat unavailable');
    const client = accessFulcraClient(token),
      userId = await client.principal(),
      own = userId === target.ownerUserId,
      root = own ? target.root : '/shared/home-twin/' + homeId;
    const file = await client.file(root + '/home.json', own ? undefined : target.ownerUserId);
    if (!file) throw Error('Current home unavailable');
    const home = JSON.parse(file.text),
      role = homeRole(home, userId);
    if (home.id !== homeId || home.ownerUserId !== target.ownerUserId || !role)
      throw Error('Current home membership required');
    return {
      home,
      fileVersion: file.id,
      scope: validateChatScope({
        homeId,
        principalId: userId,
        ownerUserId: target.ownerUserId,
        root,
        role
      })
    };
  };
}
/** @param {any} config */
export async function startChatService(config) {
  if (
    !config ||
    typeof config.key !== 'string' ||
    config.key.length < 40 ||
    !Array.isArray(config.homes) ||
    !config.homes.length ||
    config.homes.length > 20 ||
    typeof config.directory !== 'string'
  )
    throw Error('Private chat service configuration required');
  for (const home of config.homes)
    validateChatScope({
      homeId: home.homeId,
      principalId: home.ownerUserId,
      ownerUserId: home.ownerUserId,
      root: home.root,
      role: 'maintainer'
    });
  const expected = Buffer.from('Bearer ' + config.key);
  const authorize = configuredChatAccess(config);
  if (config.model) throw Error('Configure a model separately for each home');
  const models = await loadHouseModels(config.homes);
  /** @type {any} */ let worker;
  const server = createServer(async (req, res) => {
    const send = (/** @type {number} */ status, /** @type {any} */ value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'GET' && req.url === '/health') {
      send(200, { status: worker ? 'ready' : 'starting' });
      return;
    }
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (
      req.method !== 'POST' ||
      req.url !== '/' ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      send(403, { message: 'Chat access denied' });
      return;
    }
    try {
      if (!worker) throw Error('Starting');
      let count = 0,
        text = '';
      for await (const chunk of req) {
        count += chunk.length;
        if (count > 4 * 1024 * 1024 + 32768) throw Error('Request limit');
        text += chunk.toString();
      }
      send(200, await worker.dispatch(JSON.parse(text)));
    } catch {
      send(409, { message: 'Chat operation could not be confirmed. Retry the same turn.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(config.port ?? 6194, '127.0.0.1', () => yes(undefined));
  });
  try {
    const archive = await chatTranscriptArchive(join(config.directory, 'archives'));
    const uploads = await createChatUploads({
      directory: join(config.directory, 'uploads'),
      authorize,
      ioFor: (/** @type {any} */ current) => chatFileClient(current.token, current.scope),
      secretsFor: (/** @type {any} */ scope) => models.get(scope.homeId)?.secrets ?? []
    });
    const verifySources = chatActionSourceVerifier({ authorize, uploads });
    /** @type {Map<string,any>} */ const publishers = new Map();
    for (const home of config.homes) {
      if (home.recordActions !== true) continue;
      if (typeof home.maintainerDirectory !== 'string' || !home.maintainerDirectory)
        throw Error('Explicit private designated-maintainer state required');
      const state = resolve(home.maintainerDirectory);
      await mkdir(state, { recursive: true, mode: 0o700 });
      assertExternalState(state, fileURLToPath(new URL('../', import.meta.url)));
      const st = await lstat(state);
      if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077)
        throw Error('Private designated-maintainer state required');
      if (publishers.has(home.homeId)) throw Error('One action maintainer per home required');
      publishers.set(home.homeId, createChatActionPublisher({ directory: state, verifySources }));
    }
    const actions = publishers.size
      ? await createChatActions({
          directory: join(config.directory, 'actions'),
          authorize,
          verifySources,
          ioFor: (/** @type {any} */ current) => chatFileClient(current.token, current.scope),
          secretsFor: (/** @type {any} */ scope) => models.get(scope.homeId)?.secrets ?? [],
          publish: (
            /** @type {any} */ record,
            /** @type {any} */ current,
            /** @type {any} */ context
          ) => publishers.get(current.scope.homeId).publish(record, current, context),
          resolvePublication: (
            /** @type {any} */ record,
            /** @type {any} */ current,
            /** @type {any} */ context
          ) => publishers.get(current.scope.homeId).resolvePublication(record, current, context)
        })
      : null;
    const reviewHomes = new Set(
      config.homes
        .filter((/** @type {any} */ h) => h.modelReviews === true)
        .map((/** @type {any} */ h) => h.homeId)
    );
    const modelReviews = reviewHomes.size
      ? await createChatModelPatches({
          directory: join(config.directory, 'model-reviews'),
          authorize,
          verifySources,
          secretsFor: (/** @type {any} */ scope) => models.get(scope.homeId)?.secrets ?? []
        })
      : null;
    worker = await createChatWorker({
      directory: join(config.directory, 'runs'),
      authorize,
      modelFor: (/** @type {string} */ homeId) => models.get(homeId),
      readSource: chatSourceReader(),
      archive,
      uploads,
      modelReviewsFor: (/** @type {string} */ homeId) =>
        reviewHomes.has(homeId) ? modelReviews : null,
      actionsFor: (/** @type {string} */ homeId) => (publishers.has(homeId) ? actions : null)
    });
  } catch (e) {
    server.close();
    throw e;
  }
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2],
    st = await lstat(path);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 32000)
    throw Error('Private bounded config required');
  await startChatService(JSON.parse(await readFile(path, 'utf8')));
  process.stdout.write('Home chat worker ready on loopback\n');
}
