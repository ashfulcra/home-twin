import { error, json } from '@sveltejs/kit';
import { resolveHome } from './home-access.js';
import { callChatService } from './chat-service.js';
import { readBoundedBytes } from './fulcra-files.js';
/** @param {any} event */ export async function chatAccess(event) {
  const token = event.cookies.get('fulcra_access_token');
  if (!token) throw error(401, 'Sign in to chat');
  const access = await resolveHome(token);
  if (
    access.joining ||
    !access.home ||
    !['viewer', 'contributor', 'maintainer'].includes(access.role)
  )
    throw error(403, 'Home access is required');
  return { token, access };
}
/** @param {any} request */ export async function chatBody(request) {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBytes(request, 16384))
    );
  } catch {
    throw error(400, 'Use a short message or a saved home source');
  }
}
/** @param {any} id */ export function chatConversation(id) {
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    throw error(400, 'Choose a saved conversation');
  return id.toLowerCase();
}
/** @param {string} token @param {any} access @param {string} action @param {any} [fields] */ export async function relayChat(
  token,
  access,
  action,
  fields = {}
) {
  try {
    return json(await callChatService(token, access.home.id, action, fields), {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch {
    throw error(
      503,
      'Chat could not be reached. Your conversation is retained; retry this message.'
    );
  }
}
