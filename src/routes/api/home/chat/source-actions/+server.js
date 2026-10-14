import { error } from '@sveltejs/kit';
import { chatAccess, chatBody, chatConversation, relayChat } from '$lib/server/chat-route.js';
export async function POST(event) {
  const { token, access } = await chatAccess(event);
  if (
    access.role !== 'maintainer' ||
    !access.userId ||
    access.userId !== access.ownerUserId ||
    access.home.ownerUserId !== access.ownerUserId
  )
    throw error(403, 'Only the current home owner can save source files');
  const body = await chatBody(event.request);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    Object.keys(body).some((k) => !['operation', 'value'].includes(k)) ||
    !['review', 'save', 'status'].includes(body.operation)
  )
    throw error(400, 'Choose a source file or its exact saved request');
  const value = body.value,
    review = body.operation === 'review';
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== (review ? 1 : 2) ||
    Object.keys(value).some((k) => !(review ? ['sourceId'] : ['actionId', 'digest']).includes(k))
  )
    throw error(400, 'Use the exact source file request');
  let input;
  if (review) {
    if (typeof value.sourceId !== 'string' || !value.sourceId.startsWith('evidence-'))
      throw error(400, 'Choose your uploaded original');
    input = { sourceId: 'evidence-' + chatConversation(value.sourceId.slice(9)) };
  } else {
    if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest))
      throw error(400, 'Use the exact saved source review');
    input = { actionId: chatConversation(value.actionId), digest: value.digest };
  }
  return relayChat(
    token,
    access,
    review ? 'source-review' : body.operation === 'save' ? 'save-source' : 'source-status',
    { input }
  );
}
