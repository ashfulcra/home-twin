import { error, json } from '@sveltejs/kit';
import { gzipSync } from 'node:zlib';
import { resolveHome } from '$lib/server/home-access.js';
import { assemblyPreviewReader } from '$lib/server/assembly-preview-reader.js';
import { loadModelComparison } from '$lib/server/model-comparison.js';
export async function GET({ cookies, url }) {
  const token = cookies.get('fulcra_access_token');
  if (!token) throw error(401, 'Sign in first');
  const access = await resolveHome(token);
  if (
    access.role !== 'maintainer' ||
    access.userId !== access.ownerUserId ||
    access.home?.ownerUserId !== access.userId
  )
    throw error(403, 'Only this home’s current owner can view its private comparison');
  const data = url.searchParams.get('data'),
    digest = url.searchParams.get('digest');
  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== new Set(keys).size ||
    keys.some((k) => !['data', 'digest'].includes(k)) ||
    (data !== null && data !== '1') ||
    (data === '1' && (!digest || !/^[a-f0-9]{64}$/.test(digest))) ||
    (data === null && digest !== null)
  )
    throw error(400, 'Valid comparison request required');
  let result;
  try {
    result = await loadModelComparison(
      access,
      assemblyPreviewReader(access.endpoint, token, access.root),
      () => resolveHome(token),
      data === '1' ? (digest ?? undefined) : undefined
    );
  } catch (e) {
    const status =
      e && typeof e === 'object' && 'status' in e && [403, 409].includes(Number(e.status))
        ? Number(e.status)
        : 503;
    throw error(
      status,
      status === 409
        ? 'The home or comparison changed. Refresh before viewing.'
        : 'The private comparison could not be verified. Your accepted house model is unchanged.'
    );
  }
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (!result) {
    if (data === '1') throw error(404, 'No comparison is prepared');
    return json({ status: 'not-available' }, { headers });
  }
  if (data !== '1')
    return json({ status: 'ready', digest: result.digest, frozenAt: result.frozenAt }, { headers });
  // Only validated model data is returned; archived active content is never executed.
  return new Response(
    new Uint8Array(
      gzipSync(
        JSON.stringify({
          status: 'ready',
          digest: result.digest,
          frozenAt: result.frozenAt,
          models: result.models
        })
      )
    ),
    {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
      }
    }
  );
}
