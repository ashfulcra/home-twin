import { error } from '@sveltejs/kit';
import { chatAccess, chatConversation, relayChat } from '$lib/server/chat-route.js';
export async function GET(event) {
  const { token, access } = await chatAccess(event);
  const conversationId = chatConversation(event.url.searchParams.get('conversationId'));
  const raw = event.url.searchParams.get('cursor') ?? '0',
    cursor = Number(raw);
  if (!/^\d{1,7}$/.test(raw) || !Number.isSafeInteger(cursor) || cursor < 0)
    throw error(400, 'Invalid conversation position');
  return relayChat(token, access, 'events', { conversationId, cursor });
}
