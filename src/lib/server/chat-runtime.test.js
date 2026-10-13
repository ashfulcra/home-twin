import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistentChatJournal } from '../../../scripts/chat-journal.mjs';
import { runChatTurn } from '../../../scripts/chat-runtime.mjs';
const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  },
  input = {
    conversationId: '11111111-1111-4111-8111-111111111111',
    turnId: '22222222-2222-4222-8222-222222222222',
    message: 'Question',
    attachmentIds: []
  };
/** @returns {Promise<any>} */
const setup = async () => ({
  journal: await persistentChatJournal(await mkdtemp(join(tmpdir(), 'chat-runtime-')), scope),
  scope,
  input,
  authorize: async () => scope,
  tools: { definitions: [], execute: async () => ({}) },
  model: {
    async *stream() {
      yield { type: 'text', text: 'Hello' };
    }
  }
});
test('streamed reply is durable and same turn retry never invokes model twice', async () => {
  const x = await setup();
  let calls = 0;
  x.model = {
    async *stream() {
      calls++;
      yield { type: 'text', text: 'Hello' };
      yield { type: 'text', text: ' home' };
    }
  };
  await runChatTurn(x);
  await runChatTurn(x);
  expect(calls).toBe(1);
  expect(
    (await x.journal.readEvents(input.conversationId)).map((/** @type {any} */ e) => e.type)
  ).toEqual(['queued', 'started', 'text', 'text', 'completed']);
});
test('revocation before a requested tool prevents its execution and fails the run', async () => {
  const x = await setup();
  let checks = 0,
    calls = 0;
  x.authorize = async () => {
    if (++checks > 1) throw Error('revoked-secret');
    return scope;
  };
  x.model = {
    async *stream() {
      yield { type: 'tool', name: 'read_home', arguments: '{}', callId: 'call-1' };
    }
  };
  x.tools = {
    definitions: [],
    execute: async () => {
      calls++;
      return {};
    }
  };
  await runChatTurn(x);
  expect(calls).toBe(0);
  expect((await x.journal.readEvents(input.conversationId)).at(-1)).toMatchObject({
    type: 'failed',
    data: { code: 'run-failed' }
  });
});
test('bounded model tool loop stops without infinite calls', async () => {
  const x = await setup();
  let calls = 0;
  x.model = {
    async *stream() {
      calls++;
      yield { type: 'tool', name: 'read_home', arguments: '{}', callId: 'call-1' };
    }
  };
  await runChatTurn({ ...x, maxRounds: 3 });
  expect(calls).toBe(3);
  expect((await x.journal.readEvents(input.conversationId)).at(-1).type).toBe('failed');
});
test('explicit abort is cancelled; no subsequent text or tool work is committed', async () => {
  const x = await setup(),
    controller = new AbortController();
  x.model = {
    async *stream() {
      controller.abort();
      yield { type: 'text', text: 'late' };
    }
  };
  await runChatTurn({ ...x, signal: controller.signal });
  expect((await x.journal.readEvents(input.conversationId)).at(-1).type).toBe('cancelled');
  expect(
    (await x.journal.readEvents(input.conversationId)).some(
      (/** @type {any} */ e) => e.type === 'text'
    )
  ).toBe(false);
});
test('provider errors and known secrets cannot leak through journal or model context', async () => {
  const x = await setup();
  x.model = {
    async *stream() {
      yield { type: 'text', text: 'Bearer private-token' };
      throw Error('model-key confidential');
    }
  };
  await runChatTurn({ ...x, secrets: ['private-token', 'model-key'] });
  const text = JSON.stringify(await x.journal.readEvents(input.conversationId));
  expect(text).not.toContain('private-token');
  expect(text).not.toContain('model-key');
  expect(text).toContain('[redacted]');
});
test('a changed actor or owner scope cannot continue a run', async () => {
  const x = await setup();
  x.authorize = async () => ({
    ...scope,
    ownerUserId: '44444444-4444-4444-8444-444444444444',
    role: 'viewer'
  });
  await runChatTurn(x);
  expect((await x.journal.readEvents(input.conversationId)).at(-1).type).toBe('failed');
});
test('secret fragments spanning model deltas never reach transcript', async () => {
  const x = await setup();
  x.model = {
    async *stream() {
      yield { type: 'text', text: 'Here is dedicated-' };
      yield { type: 'text', text: 'model-key value. ' };
    }
  };
  await runChatTurn({ ...x, secrets: ['dedicated-model-key'] });
  const text = (await x.journal.readEvents(input.conversationId))
    .filter((/** @type {any} */ e) => e.type === 'text')
    .map((/** @type {any} */ e) => e.data.text)
    .join('');
  expect(text).toBe('Here is [redacted] value. ');
});
test('attached source IDs are resolved through current scoped tools before inference', async () => {
  const x = await setup();
  const attached = { ...input, attachmentIds: ['source-1'] };
  let got;
  let reads = 0;
  x.tools = {
    definitions: [],
    execute: async (/** @type {string} */ name, /** @type {any} */ args) => {
      expect(name).toBe('read_source');
      expect(args).toEqual({ sourceId: 'source-1' });
      reads++;
      return { id: 'source-1', text: 'Synthetic note', sha256: 'a'.repeat(64) };
    }
  };
  x.model = {
    async *stream(/** @type {any[]} */ context) {
      got = context;
      yield { type: 'text', text: 'Answer' };
    }
  };
  await runChatTurn({ ...x, input: attached });
  expect(reads).toBe(1);
  expect(JSON.stringify(got)).toContain('Synthetic note');
});
