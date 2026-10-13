import { env } from '$env/dynamic/private';
/** Relay only the current cookie caller. Model credentials remain in the worker.
 * @param {string} token @param {string} homeId @param {string} action @param {any} [fields] */
export async function callChatService(token, homeId, action, fields = {}) {
  if (!env.HOME_CHAT_SERVICE_URL || !env.HOME_CHAT_SERVICE_KEY) {
    if (action === 'status') return { available: false };
    throw Error('House chat unavailable');
  }
  const url = new URL(env.HOME_CHAT_SERVICE_URL);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error('Secure house chat service required');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.HOME_CHAT_SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token, homeId, action, ...fields }),
    signal: AbortSignal.timeout(25000)
  });
  if (!r.ok) throw Error('House chat operation unconfirmed');
  const value = await r.json();
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 5 * 1024 * 1024
  )
    throw Error('Invalid house chat reply');
  return value;
}
