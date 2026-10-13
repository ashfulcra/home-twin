import { error } from '@sveltejs/kit';
import { chatAccess, chatBody, chatConversation, relayChat } from '$lib/server/chat-route.js';
export async function POST(event) {
  const { token, access } = await chatAccess(event),
    body = await chatBody(event.request);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !('conversationId' in body)
  )
    throw error(400, 'Choose the current conversation');
  return relayChat(token, access, 'cancel', {
    conversationId: chatConversation(body.conversationId)
  });
}
