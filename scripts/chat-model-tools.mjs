import { validateModelPatch } from '../src/lib/home/model-patch.js';
const id = { type: 'string', maxLength: 200, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$' };
export const chatModelDefinition = {
  type: 'function',
  name: 'prepare_model_patch',
  description:
    'Prepare a local wall/opening dimension correction for owner review. Read exact saved wall IDs/values and supporting sources first. If sourceAdmission.required is returned, explain that the supporting file must first be accepted into home records through the existing reviewed record-save or maintainer workflow, then prepare a fresh proposal against the new home revision. Never invent a record or claim Apply is ready before that. This never applies geometry; no adds, deletes, room moves or global transforms.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      note: { type: 'string', minLength: 1, maxLength: 1800 },
      sourceIds: { type: 'array', items: id, maxItems: 6 },
      edits: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['wall', 'opening'] },
            wallId: id,
            openingId: { type: 'string', maxLength: 200 },
            field: {
              type: 'string',
              enum: ['heightFeet', 'thicknessFeet', 'widthFeet', 'offsetFeet', 'sillFeet']
            },
            expected: { type: 'number' },
            value: { type: 'number' }
          },
          required: ['target', 'wallId', 'openingId', 'field', 'expected', 'value'],
          additionalProperties: false
        }
      }
    },
    required: ['note', 'sourceIds', 'edits'],
    additionalProperties: false
  }
};
/** @param {any} args */ export const chatModelDraft = (args) =>
  validateModelPatch({ kind: 'model-patch', ...args });
