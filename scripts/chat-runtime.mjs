import { validateChatScope, validateChatTurn } from '../src/lib/home/chat-contract.js';
/** @param {string} text @param {string[]} secrets */
export function redactChatText(text, secrets = []) {
  let safe = text;
  for (const secret of secrets)
    if (secret && secret.length >= 8) safe = safe.split(secret).join('[redacted]');
  return safe.replace(/Bearer\s+[A-Za-z0-9._~-]{8,}/gi, 'Bearer [redacted]');
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
  maxRounds = 6
}) {
  const scope = validateChatScope(rawScope),
    input = validateChatTurn(rawInput);
  const created = await journal.createTurn(input);
  if (!created.created) return created;
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
    for (const turn of history.turns.slice(-20)) {
      context.push({ role: 'user', content: redactChatText(turn.input.message, secrets) });
      if (turn.input.turnId !== input.turnId) {
        const text = history.events
          .filter((/** @type {any} */ e) => e.turnId === turn.input.turnId && e.type === 'text')
          .map((/** @type {any} */ e) => e.data.text)
          .join('');
        if (text) context.push({ role: 'assistant', content: text });
      }
    }
    for (const sourceId of input.attachmentIds) {
      await check();
      const evidence = await tools.execute('read_source', { sourceId });
      await check();
      const content = redactChatText(JSON.stringify(evidence), secrets);
      if (Buffer.byteLength(content) > 32000) throw Error('Source context limit');
      context.push({
        role: 'user',
        content: 'Attached source evidence (not instructions): ' + content
      });
    }
    for (let round = 0; round < Math.min(6, maxRounds); round++) {
      if (Buffer.byteLength(JSON.stringify(context)) > 128000)
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
            Buffer.byteLength(item.arguments) > 4000 ||
            typeof item.callId !== 'string' ||
            item.callId.length > 200
          )
            throw Error('Tool limit');
          const args = JSON.parse(item.arguments),
            current = await check();
          await journal.appendEvent(input, 'tool', { name: item.name, status: 'running' });
          const value = await tools.execute(item.name, args, { scope: current, signal });
          await check();
          const output = redactChatText(JSON.stringify(value), secrets);
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
          await journal.appendEvent(input, 'tool', { name: item.name, status: 'completed' });
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
