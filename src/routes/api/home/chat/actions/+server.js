import { error } from '@sveltejs/kit';
import { chatAccess, chatBody, chatConversation, relayChat } from '$lib/server/chat-route.js';
export async function POST(event) {
  const { token, access } = await chatAccess(event);
  if (!['maintainer', 'contributor'].includes(access.role))
    throw error(403, 'Your role allows reading this home');
  const body = await chatBody(event.request);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 3 ||
    Object.keys(body).some((key) => !['conversationId', 'actionId', 'digest'].includes(key)) ||
    typeof body.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.digest)
  )
    throw error(400, 'Choose the proposed record shown in this conversation');
  return relayChat(token, access, 'apply-record', {
    input: {
      conversationId: chatConversation(body.conversationId),
      actionId: chatConversation(body.actionId),
      digest: body.digest
    }
  });
}
