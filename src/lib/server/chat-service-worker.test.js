import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatWorker } from '../../../scripts/home-chat-service.mjs';
const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  },
  turn = {
    conversationId: '11111111-1111-4111-8111-111111111111',
    turnId: '22222222-2222-4222-8222-222222222222',
    message: 'Question',
    attachmentIds: []
  };
test('worker reconnect returns durable reply and same actor/turn replay starts model once', async () => {
  let calls = 0;
  const worker = await createChatWorker({
    directory: await mkdtemp(join(tmpdir(), 'worker-')),
    authorize: async () => ({ scope, home: { name: 'Example' } }),
    model: {
      async *stream() {
        calls++;
        yield { type: 'text', text: 'Hello' };
      }
    },
    readSource: async () => ({})
  });
  await worker.dispatch({
    token: 'current-caller',
    homeId: 'example',
    action: 'turn',
    input: turn
  });
  await worker.idle();
  const events = await worker.dispatch({
    token: 'current-caller',
    homeId: 'example',
    action: 'events',
    conversationId: turn.conversationId,
    cursor: 0
  });
  expect(events.events.at(-1).type).toBe('completed');
  await worker.dispatch({
    token: 'current-caller',
    homeId: 'example',
    action: 'turn',
    input: turn
  });
  await worker.idle();
  expect(calls).toBe(1);
});
test('unconfigured provider status does not call model or accept a turn', async () => {
  const worker = await createChatWorker({
    directory: await mkdtemp(join(tmpdir(), 'worker-')),
    authorize: async () => ({ scope, home: {} })
  });
  expect(
    await worker.dispatch({ token: 'current-caller', homeId: 'example', action: 'status' })
  ).toEqual({ available: false });
  await expect(
    worker.dispatch({ token: 'current-caller', homeId: 'example', action: 'turn', input: turn })
  ).rejects.toThrow(/configured/i);
});
test('running conversation rejects a different turn and changed retry payload', async () => {
  /** @type {(value?:any)=>void} */let release = () => {};
  const gate = new Promise((resolve) => (release = resolve));
  const worker = await createChatWorker({
    directory: await mkdtemp(join(tmpdir(), 'worker-')),
    authorize: async () => ({ scope, home: { name: 'Example' } }),
    model: {
      async *stream() {
        await gate;
        yield { type: 'text', text: 'Done' };
      }
    }
  });
  const request = { token: 'current-caller', homeId: 'example', action: 'turn', input: turn };
  await worker.dispatch(request);
  try {
    await expect(
      worker.dispatch({
        ...request,
        input: { ...turn, turnId: '44444444-4444-4444-8444-444444444444' }
      })
    ).rejects.toThrow(/active|busy/i);
    await expect(
      worker.dispatch({ ...request, input: { ...turn, message: 'Different' } })
    ).rejects.toThrow(/changed|intent/i);
  } finally {
    release();
    await worker.idle();
  }
});
