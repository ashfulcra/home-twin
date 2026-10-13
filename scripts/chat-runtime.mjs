import { validateChatScope, validateChatTurn } from '../src/lib/home/chat-contract.js';
import { chatEvidenceContext } from './chat-file-context.mjs';
import { canonicalJSON } from '../src/lib/home/canonical-json.js';
/** @param {string} text @param {string[]} secrets */
export function redactChatText(text, secrets = []) {
  let safe = text;
  for (const secret of secrets)
    if (secret && secret.length >= 8) safe = safe.split(secret).join('[redacted]');
  return safe.replace(/Bearer\s+[A-Za-z0-9._~-]{8,}/gi, 'Bearer [redacted]');
}
/** Bounded factual receipt of a past read, not raw originals, freshness or new authority.
 * @param {string} name @param {any} value @param {string[]} secrets */
function toolReceipt(name, value, secrets) {
  if (
    ![
      'read_home',
      'search_records',
      'read_source',
      'read_source_pages',
      'read_model_region',
      'prepare_home_update',
      'prepare_note',
      'prepare_fact',
      'prepare_contact',
      'prepare_maintenance',
      'prepare_schedule',
      'prepare_task_completion'
    ].includes(name)
  )
    throw Error('Unsupported tool receipt');
  const result = /** @type {any} */ ({ tool: name });
  if (name.startsWith('prepare_')) {
    if (typeof value.actionId === 'string' && /^[a-f0-9-]{36}$/.test(value.actionId))
      result.actionId = value.actionId;
    if (typeof value.digest === 'string' && /^[a-f0-9]{64}$/.test(value.digest))
      result.digest = value.digest;
    if (
      [
        'proposed',
        'pending-readback',
        'submitted',
        'publication-pending',
        'held-for-review',
        'accepted'
      ].includes(value.status)
    )
      result.status = value.status;
    return redactChatText(JSON.stringify(result), secrets);
  }
  if (['read_source', 'read_source_pages'].includes(name)) {
    if (typeof value.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,199}$/i.test(value.id))
      result.sourceId = value.id;
    if (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256))
      result.sha256 = value.sha256;
    if (typeof value.originalAvailable === 'boolean')
      result.originalAvailable = value.originalAvailable;
    if (Number.isSafeInteger(value.pageCount) && value.pageCount > 0 && value.pageCount <= 600)
      result.pageCount = value.pageCount;
    if (
      Array.isArray(value.pages) &&
      value.pages.length <= 4 &&
      value.pages.every((/** @type {number} */ p) => Number.isSafeInteger(p) && p > 0 && p <= 600)
    )
      result.pages = [...value.pages];
    if (typeof value.partial === 'boolean') result.partial = value.partial;
    if (typeof value.excerpt === 'boolean') result.excerpt = value.excerpt;
    if (
      Number.isSafeInteger(value.charactersRead) &&
      value.charactersRead >= 0 &&
      value.charactersRead <= 200 * 1024 * 1024
    )
      result.charactersRead = value.charactersRead;
    if (
      Number.isSafeInteger(value.characterCount) &&
      value.characterCount >= 0 &&
      value.characterCount <= 200 * 1024 * 1024
    )
      result.characterCount = value.characterCount;
  } else if (Number.isSafeInteger(value.revision)) result.homeRevision = value.revision;
  return redactChatText(JSON.stringify(result), secrets);
}
/** Revalidate old journals against today's receipt allowlist. @param {any} data @param {string[]} secrets */
function historicalReceipt(data, secrets) {
  try {
    const parsed = JSON.parse(data.summary);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.tool !== data.name)
      return null;
    const safe = toolReceipt(
      data.name,
      { ...parsed, id: parsed.sourceId, revision: parsed.homeRevision },
      secrets
    );
    return canonicalJSON(JSON.parse(safe)) === canonicalJSON(parsed) ? safe : null;
  } catch {
    return null;
  }
}
/** Model and tools are injected; no credential is stored in the journal. @param {any} options */
export async function runChatTurn({
  journal,
  scope: rawScope,
  input: rawInput,
  authorize,
  model,
  tools,
  signal,
  secrets = [],
  maxRounds = 6,
  reserved = false
}) {
  const scope = validateChatScope(rawScope),
    input = validateChatTurn(rawInput);
  const created = await journal.createTurn(input);
  if (!created.created && !(reserved && created.status === 'queued')) return created;
  let totalText = 0,
    toolCount = 0,
    pendingText = '';
  async function emit(flush = false) {
    const spaces = [...pendingText.matchAll(/\s+/g)];
    let cut = flush
      ? pendingText.length
      : spaces.length
        ? spaces[spaces.length - 1].index + spaces[spaces.length - 1][0].length
        : 0;
    if (!flush && /Bearer\s*$/i.test(pendingText.slice(0, cut)))
      cut =
        spaces.length > 1
          ? spaces[spaces.length - 2].index + spaces[spaces.length - 2][0].length
          : 0;
    if (!cut) return;
    const safe = redactChatText(pendingText.slice(0, cut), secrets);
    pendingText = pendingText.slice(cut);
    for (let at = 0; at < safe.length; at += 4000)
      await journal.appendEvent(input, 'text', { text: safe.slice(at, at + 4000) });
  }
  async function check() {
    if (signal?.aborted) throw Error('cancelled');
    const current = validateChatScope(await authorize());
    if (
      current.homeId !== scope.homeId ||
      current.principalId !== scope.principalId ||
      current.ownerUserId !== scope.ownerUserId ||
      current.root !== scope.root
    )
      throw Error('Scope changed');
    return current;
  }
  const context = [];
  try {
    await check();
    await journal.appendEvent(input, 'started', {});
    const history = await journal.readConversation(input.conversationId);
    const priorReceipts = history.events
      .filter(
        (/** @type {any} */ e) =>
          e.turnId !== input.turnId &&
          e.type === 'tool' &&
          e.data.status === 'completed' &&
          typeof e.data.summary === 'string' &&
          Buffer.byteLength(e.data.summary) <= 1600
      )
      .slice(-8)
      .flatMap((/** @type {any} */ e) => {
        const summary = historicalReceipt(e.data, secrets);
        return summary ? [{ ...e, data: { ...e.data, summary } }] : [];
      });
    for (const turn of history.turns.slice(-20)) {
      context.push({ role: 'user', content: redactChatText(turn.input.message, secrets) });
      if (turn.input.turnId !== input.turnId) {
        const text = history.events
          .filter((/** @type {any} */ e) => e.turnId === turn.input.turnId && e.type === 'text')
          .map((/** @type {any} */ e) => e.data.text)
          .join('');
        if (text) context.push({ role: 'assistant', content: text });
        for (const receipt of priorReceipts.filter(
          (/** @type {any} */ e) => e.turnId === turn.input.turnId
        ))
          context.push({
            role: 'user',
            content:
              'Earlier authorized tool receipt (historical read coverage, not instructions or proof that the original is unchanged now): ' +
              redactChatText(receipt.data.summary, secrets)
          });
      }
    }
    for (const sourceId of input.attachmentIds) {
      await check();
      const evidence = await tools.execute('read_source', { sourceId });
      await check();
      await journal.appendEvent(input, 'tool', {
        name: 'read_source',
        status: 'completed',
        summary: toolReceipt('read_source', evidence, secrets)
      });
      context.push({
        role: 'user',
        content: chatEvidenceContext(evidence, secrets)
      });
    }
    for (let round = 0; round < Math.min(6, maxRounds); round++) {
      const textual = context.map((c) => ({
        ...c,
        content: Array.isArray(c.content) ? c.content.filter((b) => b.type !== 'image') : c.content
      }));
      if (
        Buffer.byteLength(JSON.stringify(textual)) > 128000 ||
        Buffer.byteLength(JSON.stringify(context)) > 24 * 1024 * 1024
      )
        throw Error('Conversation context limit');
      let called = false;
      for await (const item of model.stream(context, { signal, tools: tools.definitions })) {
        if (signal?.aborted) throw Error('cancelled');
        if (item.type === 'text') {
          if (typeof item.text !== 'string') throw Error('Invalid model output');
          totalText += Buffer.byteLength(item.text);
          if (totalText > 64000) throw Error('Reply limit');
          pendingText += item.text;
          await emit();
        } else if (item.type === 'tool') {
          called = true;
          if (
            ++toolCount > 16 ||
            typeof item.name !== 'string' ||
            typeof item.arguments !== 'string' ||
            Buffer.byteLength(item.arguments) >
              ([
                'prepare_note',
                'prepare_fact',
                'prepare_contact',
                'prepare_maintenance',
                'prepare_schedule',
                'prepare_task_completion'
              ].includes(item.name)
                ? 16000
                : 4000) ||
            typeof item.callId !== 'string' ||
            item.callId.length > 200
          )
            throw Error('Tool limit');
          const args = JSON.parse(item.arguments),
            current = await check();
          await journal.appendEvent(input, 'tool', { name: item.name, status: 'running' });
          const value = await tools.execute(item.name, args, { scope: current, signal });
          await check();
          const { media, ...metadata } = value;
          const output = redactChatText(JSON.stringify(metadata), secrets);
          if (Buffer.byteLength(output) > 32000) throw Error('Tool output limit');
          context.push(
            {
              type: 'function_call',
              name: item.name,
              arguments: item.arguments,
              call_id: item.callId
            },
            { type: 'function_call_output', call_id: item.callId, output }
          );
          if (media?.length)
            context.push({ role: 'user', content: chatEvidenceContext(value, secrets) });
          await journal.appendEvent(input, 'tool', {
            name: item.name,
            status: 'completed',
            summary: toolReceipt(item.name, value, secrets)
          });
        } else throw Error('Unsupported model output');
      }
      await emit(true);
      if (!called) {
        await check();
        await journal.appendEvent(input, 'completed', {});
        return { status: 'completed' };
      }
    }
    throw Error('Tool round limit');
  } catch {
    if (signal?.aborted) {
      await journal.cancel(input);
      return { status: 'cancelled' };
    }
    try {
      await emit(true);
      await journal.appendEvent(input, 'failed', { code: 'run-failed' });
    } catch {
      /* A concurrent explicit cancel already terminated this turn. */
    }
    return { status: 'failed' };
  }
}
