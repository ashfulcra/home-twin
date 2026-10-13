import { validateContribution } from './contributions.js';
const fields = [
  'kind',
  'entityId',
  'field',
  'value',
  'text',
  'performedAt',
  'phone',
  'email',
  'dueAt',
  'assignee',
  'scheduleId',
  'contactId',
  'occurrenceDueAt',
  'recurrence',
  'sourceIds'
];
/** Model proposals contain data only; identity, revision and effects belong to the server. @param {any} input */
export function validateHomeAction(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !fields.includes(k)) ||
    !['note', 'fact', 'contact', 'maintenance', 'schedule', 'task-completion'].includes(input.kind)
  )
    throw Error('Unsupported house record proposal');
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length > 6)
    throw Error('Choose up to six home source references');
  const portable = validateContribution({
    ...input,
    id: '00000000-0000-4000-8000-000000000000',
    homeId: 'example'
  });
  const { id, homeId, ...result } = portable;
  return result;
}
