import { test, expect } from 'vitest';
import { validateHomeAction } from './chat-action.js';
import { validateContribution, reconcileContributions } from './contributions.js';
const id = '11111111-1111-4111-8111-111111111111';
const home = {
  id: 'example',
  revision: 2,
  equipment: [{ id: 'heater', name: 'Example heater' }],
  rooms: [],
  sources: [{ id: 'manual' }],
  contacts: [],
  schedules: [],
  history: []
};
test('action inputs are portable typed values, never model-supplied authority or geometry', () => {
  expect(
    validateHomeAction({ kind: 'note', text: 'Record the manual reference', sourceIds: ['manual'] })
  ).toEqual({ kind: 'note', text: 'Record the manual reference', sourceIds: ['manual'] });
  for (const patch of [
    { root: '/Other' },
    { token: 'pretend' },
    { id },
    { homeId: 'other' },
    { authorUserId: 'other' },
    { kind: 'geometry' },
    { baseRevision: 1 }
  ])
    expect(() =>
      validateHomeAction({ kind: 'note', text: 'x', sourceIds: ['manual'], ...patch })
    ).toThrow();
  expect(() =>
    validateHomeAction({
      kind: 'maintenance',
      text: 'Probably serviced recently',
      performedAt: '',
      sourceIds: ['manual']
    })
  ).toThrow();
});
test('all typed house records preserve valid source attribution and hold unknown sources', () => {
  const inputs = [
    { kind: 'fact', entityId: 'heater', field: 'model', value: 'H200' },
    { kind: 'contact', field: 'heating', value: 'Synthetic provider' },
    {
      kind: 'maintenance',
      entityId: 'heater',
      text: 'Explicit synthetic service',
      performedAt: '2026-01-01T12:00:00Z'
    },
    {
      kind: 'schedule',
      field: 'maintenance',
      value: 'Inspect synthetic heater',
      dueAt: '2027-01-01T12:00:00Z'
    }
  ];
  for (const input of inputs) {
    const row = {
      ...validateContribution({ id, homeId: home.id, ...input, sourceIds: ['manual'] }),
      authorUserId: 'member',
      recordedAt: '2026-10-01T12:00:00Z'
    };
    const result = reconcileContributions(home, [row]);
    expect(result.accepted).toEqual([id]);
    expect(result.home.contributionEvidence[0].sourceIds).toEqual(['manual']);
    const bad = reconcileContributions(home, [{ ...row, sourceIds: ['unknown'] }]);
    expect(bad.accepted).toEqual([]);
    expect(bad.review[0].reason).toBe('unknown-source-reference');
  }
  const fact = reconcileContributions(home, [
    {
      id,
      homeId: home.id,
      kind: 'fact',
      entityId: 'heater',
      field: 'model',
      value: 'H200',
      sourceIds: ['manual'],
      authorUserId: 'member',
      recordedAt: '2026-10-01T12:00:00Z'
    }
  ]);
  expect(fact.home.equipment[0].fieldEvidence.model[0].sourceIds).toEqual(['manual']);
});
