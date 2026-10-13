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
  archive
}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink() || root.mode & 0o077)
    throw Error('Private chat runtime directory required');
  /** @type {Map<string,Promise<any>>} */ const journals = new Map();
  /** @type {Map<string,any>} */ const active = new Map();
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
      await Promise.all([...active.values()].map((x) => x.promise));
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
      if (request.action === 'status') return { available: !!selectedModel };
      const journal = await journalFor(scope);
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
        const tools = createChatHomeTools({ authorize: reauthorize, readSource });
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
        if (count > 32000) throw Error('Request limit');
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
    worker = await createChatWorker({
      directory: join(config.directory, 'runs'),
      authorize,
      modelFor: (/** @type {string} */ homeId) => models.get(homeId),
      readSource: chatSourceReader(),
      archive
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
