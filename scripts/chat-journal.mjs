import { withChatLock } from './chat-lock.mjs';
import { mkdir, open, readFile, rename, readdir, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateChatTurn, validateChatScope } from '../src/lib/home/chat-contract.js';
/** @type {Map<string,Promise<any>>} */
const queues = new Map();
/** @param {unknown} e */
const missing = (e) => !!e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT';
const terminal = new Set(['completed', 'cancelled', 'interrupted', 'failed', 'uncertain']);
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** @param {string} path */
async function privateFile(path) {
  try {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink()) throw new Error('Unsafe journal file');
    await chmod(path, 0o600);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}
/** @param {string} path @param {any} value */
async function atomic(path, value) {
  await privateFile(path);
  const temp = path + '.' + randomUUID() + '.tmp';
  const f = await open(temp, 'wx', 0o600);
  try {
    await f.writeFile(JSON.stringify(value));
    await f.sync();
  } finally {
    await f.close();
  }
  await rename(temp, path);
  const d = await open(join(path, '..'), 'r');
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}
/** @param {string} type @param {any} data */
function eventData(type, data) {
  /** @type {Record<string,string[]>} */
  const fields = {
    queued: [],
    started: [],
    text: ['text'],
    tool: ['name', 'status'],
    completed: [],
    cancelled: [],
    interrupted: [],
    failed: ['code'],
    uncertain: ['code']
  };
  if (
    !fields[type] ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some((k) => !fields[type].includes(k)) ||
    Object.values(data).some((v) => typeof v !== 'string' || Buffer.byteLength(v) > 16000)
  )
    throw new Error('Invalid journal event');
  return { ...data };
}
/** One directory per authenticated home/principal. Recovery is called only by the exclusive worker at startup. */
/** @param {string} directory @param {any} rawScope */
export async function persistentChatJournal(directory, rawScope) {
  const scope = validateChatScope(rawScope);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const ds = await lstat(directory);
  if (!ds.isDirectory() || ds.isSymbolicLink()) throw new Error('Unsafe journal directory');
  await chmod(directory, 0o700);
  const binding = {
    homeId: scope.homeId,
    principalId: scope.principalId,
    ownerUserId: scope.ownerUserId,
    root: scope.root
  };
  const identity = join(directory, 'identity.json');
  await privateFile(identity);
  try {
    const f = await open(identity, 'wx', 0o600);
    try {
      await f.writeFile(JSON.stringify(binding));
      await f.sync();
    } finally {
      await f.close();
    }
  } catch (e) {
    if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'EEXIST') throw e;
  }
  if (JSON.stringify(JSON.parse(await readFile(identity, 'utf8'))) !== JSON.stringify(binding))
    throw new Error('Journal scope collision');
  const pathFor = (/** @type {string} */ id) => {
    if (typeof id !== 'string' || !idPattern.test(id))
      throw new Error('Invalid conversation identifier');
    return join(directory, id + '.json');
  };
  /** @param {string} id @param {(path:string)=>Promise<any>} fn */
  async function serial(id, fn) {
    const path = pathFor(id);
    const previous = queues.get(path) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        return withChatLock(path, () => fn(path));
      });
    queues.set(path, job);
    try {
      return await job;
    } finally {
      if (queues.get(path) === job) queues.delete(path);
    }
  }
  /** @param {string} path @returns {Promise<any>} */
  async function read(path) {
    await privateFile(path);
    try {
      const s = await lstat(path);
      if (s.size > 4 * 1024 * 1024) throw new Error('Conversation size limit');
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (record.schema !== 1 || JSON.stringify(record.binding) !== JSON.stringify(binding))
        throw new Error('Journal scope collision');
      return record;
    } catch (e) {
      if (missing(e)) return { schema: 1, binding, turns: [], events: [] };
      throw e;
    }
  }
  /** @param {any} record @param {any} input @param {string} type @param {any} data */
  function add(record, input, type, data) {
    if (record.events.length >= (terminal.has(type) ? 5100 : 4999))
      throw new Error('Conversation event limit');
    const event = {
      cursor: record.events.length + 1,
      turnId: input.turnId,
      type,
      data: eventData(type, data),
      at: new Date().toISOString()
    };
    record.events.push(event);
    return event;
  }
  /** @param {any} record @param {any} input */
  function find(record, input) {
    const turn = record.turns.find((/** @type {any} */ t) => t.input.turnId === input.turnId);
    if (!turn || JSON.stringify(turn.input) !== JSON.stringify(validateChatTurn(input)))
      throw new Error('Unknown or changed turn intent');
    return turn;
  }
  return {
    /** @param {string} conversationId */
    async readConversation(conversationId) {
      return serial(conversationId, async (path) => read(path));
    },
    /** @param {any} rawInput */
    async createTurn(rawInput) {
      const input = validateChatTurn(rawInput);
      return serial(input.conversationId, async (path) => {
        const record = await read(path);
        const old = record.turns.find((/** @type {any} */ t) => t.input.turnId === input.turnId);
        if (old) {
          find(record, input);
          return { created: false, status: old.status };
        }
        if (record.turns.some((/** @type {any} */ t) => !terminal.has(t.status)))
          throw new Error('Conversation already active');
        if (record.turns.length >= 100) throw new Error('Conversation turn limit');
        record.turns.push({ input, status: 'queued' });
        add(record, input, 'queued', {});
        await atomic(path, record);
        return { created: true, status: 'queued' };
      });
    },
    /** @param {any} input @param {string} type @param {any} data */
    async appendEvent(input, type, data) {
      return serial(input.conversationId, async (path) => {
        const record = await read(path),
          turn = find(record, input);
        if (terminal.has(turn.status)) throw new Error('Turn already terminal');
        const event = add(record, input, type, data);
        turn.status = terminal.has(type) ? type : type === 'started' ? 'running' : turn.status;
        await atomic(path, record);
        return event;
      });
    },
    /** @param {string} conversationId @param {number} cursor */
    async readEvents(conversationId, cursor = 0) {
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid event cursor');
      return serial(conversationId, async (path) =>
        (await read(path)).events.filter((/** @type {any} */ e) => e.cursor > cursor)
      );
    },
    /** @param {any} input */
    async cancel(input) {
      return serial(input.conversationId, async (path) => {
        const record = await read(path),
          turn = find(record, input);
        if (!terminal.has(turn.status)) {
          add(record, input, 'cancelled', {});
          turn.status = 'cancelled';
          await atomic(path, record);
        }
        return { status: turn.status };
      });
    },
    async recover() {
      /** @type {string[]} */
      const recovered = [];
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5))) continue;
        await serial(name.slice(0, -5), async (path) => {
          const record = await read(path);
          for (const turn of record.turns) {
            if (terminal.has(turn.status)) continue;
            add(record, turn.input, 'interrupted', {});
            turn.status = 'interrupted';
            recovered.push(turn.input.turnId);
          }
          await atomic(path, record);
        });
      }
      return recovered;
    }
  };
}
