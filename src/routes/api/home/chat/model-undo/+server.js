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
    throw error(403, 'Only the current home owner can apply model changes');
  const body = await chatBody(event.request);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 3 ||
    Object.keys(body).some((k) => !['conversationId', 'actionId', 'digest'].includes(k)) ||
    typeof body.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.digest)
  )
    throw error(400, 'Choose the exact model review shown in this conversation');
  return relayChat(token, access, 'undo-model', {
    input: {
      conversationId: chatConversation(body.conversationId),
      actionId: chatConversation(body.actionId),
      digest: body.digest
    }
  });
}
