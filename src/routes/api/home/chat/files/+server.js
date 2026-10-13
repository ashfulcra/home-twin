import { error } from '@sveltejs/kit';
import { chatAccess, relayChat } from '$lib/server/chat-route.js';
import { readBoundedBytes } from '$lib/server/fulcra-files.js';
export async function POST(event) {
  const { token, access } = await chatAccess(event);
  if (!['maintainer', 'contributor'].includes(access.role))
    throw error(403, 'Your role can ask questions but cannot add files');
  let body;
  try {
    body = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readBoundedBytes(event.request, 4 * 1024 * 1024 + 8192)
      )
    );
  } catch {
    throw error(400, 'Choose a supported file');
  }
  if (
    !body ||
    Object.keys(body).length !== 2 ||
    !Object.hasOwn(body, 'input') ||
    !['prepare', 'chunk', 'status', 'finish'].includes(body.operation)
  )
    throw error(400, 'Unsupported file operation');
  return relayChat(token, access, 'file', {
    input: { operation: body.operation, value: body.input }
  });
}
