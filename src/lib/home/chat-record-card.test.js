import { test, expect } from 'vitest';
import { recordCard } from './chat-record-card.js';
test('review card exposes every approved record field and resolves references without cloud paths', () => {
  const card = recordCard(
    {
      kind: 'schedule',
      value: 'Inspect example filter',
      field: 'maintenance',
      text: 'Check condition',
      dueAt: '2027-01-01',
      entityId: 'e1',
      assignee: 'Owner',
      recurrence: { every: 3, unit: 'months' },
      sourceIds: ['s1']
    },
    {
      equipment: [{ id: 'e1', name: 'Example unit' }],
      sources: [{ id: 's1', title: 'Synthetic manual', path: '/private/original' }]
    }
  );
  expect(card.title).toBe('Maintenance task');
  expect(card.rows).toEqual([
    ['Title', 'Inspect example filter'],
    ['Details', 'Check condition'],
    ['Equipment', 'Example unit'],
    ['Due', '2027-01-01'],
    ['Assigned to', 'Owner'],
    ['Repeats', 'Every 3 months'],
    ['Sources', 'Synthetic manual']
  ]);
  expect(JSON.stringify(card)).not.toContain('/private');
});
test('fact and task completion cards retain exact field and occurrence being approved', () => {
  expect(
    recordCard({ kind: 'fact', entityId: 'e', field: 'serial', value: 'XYZ', sourceIds: [] }, {})
      .rows
  ).toEqual([
    ['Equipment', 'e'],
    ['Field', 'Serial number'],
    ['Value', 'XYZ']
  ]);
  const c = recordCard(
    {
      kind: 'task-completion',
      scheduleId: 't',
      performedAt: '2026-01-02',
      occurrenceDueAt: '2026-01-01',
      text: 'Actually completed',
      sourceIds: []
    },
    { schedules: [{ id: 't', name: 'Example inspection' }] }
  );
  expect(c.rows).toContainEqual(['Task', 'Example inspection']);
  expect(c.rows).toContainEqual(['Occurrence due', '2026-01-01']);
});
