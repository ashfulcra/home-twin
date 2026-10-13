import {validHomeRoot} from './home-root.js';
export const MAX_CHAT_TEXT_BYTES = 8000;
export const MAX_CHAT_ATTACHMENTS = 6;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sourceId = /^[a-z0-9][a-z0-9._-]{0,199}$/i;
/** Client requests carry portable text/source references, never authority. @param {any} input */
export function validateChatTurn(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['conversationId','turnId','message','attachmentIds'].includes(key)))
    throw new Error('Unsupported chat fields');
  if (typeof input.conversationId !== 'string' || !uuid.test(input.conversationId) ||
      typeof input.turnId !== 'string' || !uuid.test(input.turnId)) throw new Error('Stable chat identifiers required');
  if (typeof input.message !== 'string' || new TextEncoder().encode(input.message).byteLength > MAX_CHAT_TEXT_BYTES)
    throw new Error('Chat text exceeds the limit');
  const attachmentIds = input.attachmentIds ?? [];
  if (!Array.isArray(attachmentIds) || attachmentIds.length > MAX_CHAT_ATTACHMENTS ||
      attachmentIds.some(id => typeof id !== 'string' || !sourceId.test(id)) ||
      new Set(attachmentIds).size !== attachmentIds.length) throw new Error('Invalid chat source references');
  const message = input.message.trim();
  if (!message && !attachmentIds.length) throw new Error('Add a message or source');
  return {conversationId:input.conversationId.toLowerCase(),turnId:input.turnId.toLowerCase(),message,attachmentIds:[...attachmentIds]};
}
/** Validate an already authenticated scope; this function does not establish authentication. @param {any} scope */
export function validateChatScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
      Object.keys(scope).some(key => !['homeId','principalId','ownerUserId','root','role'].includes(key)) ||
      typeof scope.principalId !== 'string' || !uuid.test(scope.principalId) ||
      typeof scope.ownerUserId !== 'string' || !uuid.test(scope.ownerUserId) ||
      typeof scope.homeId !== 'string' || !validHomeRoot(scope.homeId,scope.root)) throw new Error('Invalid chat scope');
  chatCapabilities(scope.role);
  const principalId=scope.principalId.toLowerCase(),ownerUserId=scope.ownerUserId.toLowerCase();
  if (scope.role==='maintainer' && principalId!==ownerUserId) throw new Error('Current designated maintainer required');
  return {homeId:scope.homeId,principalId,ownerUserId,root:scope.root,role:scope.role};
}
/** @param {any} role */
export function chatCapabilities(role) {
  if (!['viewer','contributor','maintainer'].includes(role)) throw new Error('Current home role required');
  return {read:true,contribute:role!=='viewer',publishRoutine:role==='maintainer',proposeGeometry:role!=='viewer'};
}
