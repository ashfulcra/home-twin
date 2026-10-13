import { validateHomeAction } from '../src/lib/home/chat-action.js';
const text = { type: 'string', maxLength: 1800 },
  short = { type: 'string', maxLength: 500 };
const sourceIds = { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 6 };
/** @type {Array<[string,Record<string,any>]>} */
const specifications = [
  ['note', { text, entityId: short, sourceIds }],
  [
    'fact',
    {
      entityId: short,
      field: {
        type: 'string',
        enum: ['model', 'manufacturer', 'serial', 'capacity', 'installedAt']
      },
      value: short,
      sourceIds
    }
  ],
  ['contact', { value: short, field: short, phone: short, email: short, text, sourceIds }],
  ['maintenance', { text, entityId: short, performedAt: short, contactId: short, sourceIds }],
  [
    'schedule',
    {
      value: short,
      field: { type: 'string', enum: ['maintenance', 'chore'] },
      dueAt: short,
      entityId: short,
      assignee: short,
      text,
      every: { type: 'integer', minimum: 0, maximum: 365 },
      unit: { type: 'string', enum: ['none', 'days', 'weeks', 'months'] },
      sourceIds
    }
  ],
  [
    'task_completion',
    { scheduleId: short, performedAt: short, occurrenceDueAt: short, text, sourceIds }
  ]
];
export const chatActionDefinitions = specifications.map(([kind, properties]) => ({
  type: 'function',
  name: 'prepare_' + kind,
  description:
    'Prepare a ' +
    kind +
    ' record for the user to review and Save. This does not save or publish. Use only explicit evidence; empty optional strings, every0/unitnone for no recurrence. Never infer completed service or dates.',
  strict: true,
  parameters: {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  }
}));
/** Typed data only; neither model nor document can call an effectful approval. @param {string} name @param {any} args */
export function chatActionDraft(name, args) {
  const definition = chatActionDefinitions.find((x) => x.name === name);
  if (!definition || !args || typeof args !== 'object' || Array.isArray(args))
    throw Error('Unknown typed record tool');
  const fields = Object.keys(definition.parameters.properties);
  if (
    Object.keys(args).length !== fields.length ||
    Object.keys(args).some((k) => !fields.includes(k))
  )
    throw Error('Exact typed record fields required');
  if (
    fields.some(
      (k) =>
        !['sourceIds', 'every'].includes(k) &&
        (typeof args[k] !== 'string' || args[k].length > (k === 'text' ? 1800 : 500))
    )
  )
    throw Error('Typed record field exceeds limits');
  const kind = name.slice(8).replace('_', '-');
  /** @type {any} */ const draft = { kind, sourceIds: args.sourceIds };
  for (const k of fields)
    if (!['sourceIds', 'every', 'unit'].includes(k) && args[k] !== '') draft[k] = args[k];
  if (kind === 'schedule') {
    if (
      !Number.isSafeInteger(args.every) ||
      args.every < 0 ||
      args.every > 365 ||
      !['none', 'days', 'weeks', 'months'].includes(args.unit) ||
      (args.every === 0) !== (args.unit === 'none')
    )
      throw Error('Choose an explicit recurrence or none');
    if (args.every) draft.recurrence = { every: args.every, unit: args.unit };
  }
  return validateHomeAction(draft);
}
