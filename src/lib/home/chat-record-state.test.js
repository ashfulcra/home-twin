import { test, expect } from 'vitest';
import { mergeRecordActions } from './chat-record-state.js';
const original = { actionId: 'a', digest: 'exact', conversationId: 'c', status: 'proposed' };
test('late polls cannot undo confirmed or pending progress for the same decision', () => {
  for (const status of [
    'accepted',
    'submitted',
    'held-for-review',
    'publication-pending',
    'pending-readback'
  ])
    expect(mergeRecordActions([{ ...original, status }], [original], 'c')[0].status).toBe(status);
  expect(
    mergeRecordActions(
      [{ ...original, status: 'accepted' }],
      [{ ...original, status: 'publication-pending' }],
      'c'
    )[0].status
  ).toBe('accepted');
  expect(mergeRecordActions([original], [{ ...original, status: 'accepted' }], 'c')[0].status).toBe(
    'accepted'
  );
});
test('revoked/empty lists and different exact decisions are never revived locally', () => {
  expect(mergeRecordActions([{ ...original, status: 'accepted' }], [], 'c')).toEqual([]);
  expect(
    mergeRecordActions(
      [{ ...original, status: 'accepted' }],
      [{ ...original, digest: 'changed' }],
      'c'
    )[0].status
  ).toBe('proposed');
  expect(mergeRecordActions([], [original], 'other')).toEqual([]);
});

test('queued and failed approval states are visible without discarding current worker activity', () => {
  const a = { ...original, status: 'publication-pending', operation: { active: true } };
  const merged = mergeRecordActions(
    [a],
    [{ ...original, status: 'queued', operation: { active: false } }],
    'c'
  )[0];
  expect(merged.status).toBe('publication-pending');
  expect(merged.operation.active).toBe(false);
  expect(
    mergeRecordActions(
      [{ ...original, status: 'queued' }],
      [{ ...original, status: 'save-unconfirmed' }],
      'c'
    )[0].status
  ).toBe('save-unconfirmed');
});
