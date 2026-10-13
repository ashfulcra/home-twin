import { error, json } from '@sveltejs/kit';
import { chatAccess, chatBody, relayChat } from '$lib/server/chat-route.js';
import { callChatService } from '$lib/server/chat-service.js';
import { validateChatTurn } from '$lib/home/chat-contract.js';
export async function GET(event) {
  const { token, access } = await chatAccess(event);
  let result;
  try {
    result = await callChatService(token, access.home.id, 'status');
  } catch {
    throw error(503, 'Chat is temporarily unavailable');
  }
  return json(
    { ...result, callerId: access.userId, homeId: access.home.id },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
export async function POST(event) {
  const { token, access } = await chatAccess(event);
  let input;
  try {
    input = validateChatTurn(await chatBody(event.request));
  } catch {
    throw error(400, 'Use a short message and saved home sources');
  }
  return relayChat(token, access, 'turn', { input });
}
