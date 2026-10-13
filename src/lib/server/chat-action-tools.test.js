import { test, expect } from 'vitest';
import { createChatHomeTools } from '../../../scripts/chat-home-tools.mjs';
test('typed record tools prepare only, retain source references and expose no apply or geometry tool', async () => {
  /** @type {any[]} */ const prepared = [];
  const tools = createChatHomeTools({
    authorize: async () => ({ home: { id: 'example' }, role: 'maintainer' }),
    prepareAction: async (/** @type {any} */ draft) => {
      prepared.push(draft);
      return { status: 'proposed', actionId: 'example' };
    }
  });
  const definition = tools.definitions.find((x) => x.name === 'prepare_note');
  expect(definition).toBeTruthy();
  if (!definition) throw Error('Missing typed tool');
  expect(definition.parameters.required).toEqual(Object.keys(definition.parameters.properties));
  expect(
    await tools.execute('prepare_note', {
      text: 'Synthetic manual advice',
      entityId: '',
      sourceIds: ['manual']
    })
  ).toEqual({ status: 'proposed', actionId: 'example' });
  expect(prepared).toEqual([
    { kind: 'note', text: 'Synthetic manual advice', sourceIds: ['manual'] }
  ]);
  expect(tools.definitions.some((x) => /apply|geometry|share|send/.test(x.name))).toBe(false);
});
test('a revoked writer cannot prepare and unknown authority arguments fail before callback', async () => {
  let calls = 0;
  const tools = createChatHomeTools({
    authorize: async () => ({ home: { id: 'example' }, role: 'viewer' }),
    prepareAction: async () => {
      calls++;
    }
  });
  await expect(
    tools.execute('prepare_note', { text: 'Synthetic advice', entityId: '', sourceIds: [] })
  ).rejects.toThrow(/role|contribution/i);
  await expect(
    tools.execute('prepare_note', {
      text: 'Synthetic advice',
      entityId: '',
      sourceIds: [],
      root: '/Other'
    })
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
test('read-only chat does not offer typed preparation and explicit dates/recurrence are validated', async () => {
  const read = createChatHomeTools({
    authorize: async () => ({ home: { id: 'example' }, role: 'viewer' })
  });
  expect(read.definitions.some((x) => x.name.startsWith('prepare_'))).toBe(false);
  const tools = createChatHomeTools({
    authorize: async () => ({ home: { id: 'example' }, role: 'maintainer' }),
    prepareAction: async (/** @type {any} */ draft) => draft
  });
  const args = {
    value: 'Synthetic chore',
    field: 'chore',
    dueAt: '2026-11-01',
    entityId: '',
    assignee: '',
    text: 'User supplied interval',
    every: 2,
    unit: 'weeks',
    sourceIds: []
  };
  expect((await tools.execute('prepare_schedule', args)).recurrence).toEqual({
    every: 2,
    unit: 'weeks'
  });
  await expect(tools.execute('prepare_schedule', { ...args, unit: 'hours' })).rejects.toThrow();
  await expect(
    tools.execute('prepare_maintenance', {
      text: 'Synthetic service',
      entityId: '',
      performedAt: '2099-01-01',
      contactId: '',
      sourceIds: []
    })
  ).rejects.toThrow();
});
