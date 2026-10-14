import { test, expect } from 'vitest';
import { modelConversationActions, mergeModelReviews } from './chat-model-state.js';
const conversationId = '11111111-1111-4111-8111-111111111111',
  action = {
    conversationId,
    actionId: '22222222-2222-4222-8222-222222222222',
    digest: 'a'.repeat(64)
  };
test('late model replies cannot change a newer conversation or a revoked interface', async () => {
  let state = { conversationId, generation: 1, enabled: true, disposed: false };
  /** @type {(v:any)=>void} */ let release = () => {};
  const client = modelConversationActions(
      async () => new Promise((r) => (release = r)),
      () => state
    ),
    pending = client(action, 'apply');
  state = { ...state, generation: 2 };
  release({ ...action, status: 'model-applied' });
  expect(await pending).toBe(null);
  state = { ...state, enabled: false };
  expect(await client(action, 'apply')).toBe(null);
});
test('model requests send only exact identifiers and reject mismatched results', async () => {
  let sent;
  const state = { conversationId, generation: 1, enabled: true, disposed: false },
    client = modelConversationActions(
      async (/** @type {string} */ url, /** @type {any} */ options) => {
        sent = { url, body: JSON.parse(options.body) };
        return { ...action, digest: 'b'.repeat(64) };
      },
      () => state
    );
  expect(await client({ ...action, root: '/Elsewhere' }, 'undo')).toBe(null);
  expect(sent).toEqual({ url: '/api/home/chat/model-undo', body: action });
});
test('all incoming conversation reviews survive reload, including inverse reviews without a chat turn', () => {
  const undo = {
      ...action,
      actionId: '33333333-3333-4333-8333-333333333333',
      turnId: '44444444-4444-4444-8444-444444444444'
    },
    current = [{ ...action, progress: { ...action, status: 'model-applied' } }];
  expect(mergeModelReviews(current, [action, undo], conversationId)).toHaveLength(2);
  expect(mergeModelReviews(current, [action, undo], conversationId)[0].progress.status).toBe(
    'model-applied'
  );
  expect(mergeModelReviews(current, [], conversationId)).toEqual([]);
});
import { modelOperationActive, mergeModelProgress } from './chat-model-state.js';
test('old conversation activity never locks a newly selected context', () => {
  const slot = { conversationId, generation: 1, actionId: action.actionId };
  expect(modelOperationActive(slot, { conversationId, generation: 1 })).toBe(true);
  expect(modelOperationActive(slot, { conversationId, generation: 2 })).toBe(false);
  expect(modelOperationActive(slot, { conversationId: 'other', generation: 1 })).toBe(false);
});
test('delayed checking replies cannot overwrite a confirmed model change or inverse preview', () => {
  const applied = { ...action, status: 'model-applied' },
    checking = { ...action, status: 'checking-model-sources' };
  expect(mergeModelProgress(applied, checking)).toEqual(applied);
  const undo = { ...action, status: 'undo-preview-ready', review: { actionId: 'inverse' } };
  expect(mergeModelProgress(undo, { ...action, status: 'preparing-model-undo' })).toEqual(undo);
});
