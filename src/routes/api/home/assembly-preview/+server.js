import { error, json } from '@sveltejs/kit';
import { resolveHome } from '$lib/server/home-access.js';
import { loadAssemblyPreview } from '$lib/server/assembly-preview.js';
import { assemblyPreviewReader } from '$lib/server/assembly-preview-reader.js';
const chunkBytes = 4 * 1024 * 1024;
export async function GET({ cookies, url }) {
  const token = cookies.get('fulcra_access_token');
  if (!token) throw error(401, 'Sign in first');
  const access = await resolveHome(token);
  if (
    access.role !== 'maintainer' ||
    access.userId !== access.ownerUserId ||
    access.home?.ownerUserId !== access.userId
  )
    throw error(403, 'Only this home’s current owner can view the private source model');
  const mesh = url.searchParams.get('mesh'),
    digest = url.searchParams.get('digest'),
    part = url.searchParams.get('part') ?? '0';
  if (
    (mesh !== null && mesh !== '1') ||
    (mesh === '1' && (!digest || !/^[a-f0-9]{64}$/.test(digest) || !/^([0-3])$/.test(part))) ||
    (mesh === null && url.searchParams.has('part'))
  )
    throw error(400, 'Valid source model request required');
  let result;
  try {
    result = await loadAssemblyPreview(
      access,
      assemblyPreviewReader(access.endpoint, token, access.root),
      () => resolveHome(token),
      mesh === '1' ? (digest ?? undefined) : undefined
    );
  } catch (e) {
    const status =
      e && typeof e === 'object' && 'status' in e && [403, 409].includes(Number(e.status))
        ? Number(e.status)
        : 503;
    throw error(
      status,
      status === 409
        ? 'The source preview needs refreshing against the current home and source files. Saved records are unchanged.'
        : 'The private source preview could not be verified. This does not change your accepted home.'
    );
  }
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (!result) {
    if (mesh === '1') throw error(404, 'No source preview is prepared');
    return json({ status: 'not-available' }, { headers });
  }
  const count = Math.ceil(result.meshBytes.length / chunkBytes);
  if (mesh === '1') {
    const i = Number(part);
    if (i >= count) throw error(400, 'Source mesh part unavailable');
    return new Response(
      new Uint8Array(result.meshBytes.slice(i * chunkBytes, (i + 1) * chunkBytes)),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'X-Preview-Digest': result.previewDigest
        }
      }
    );
  }
  return json(
    {
      status: result.model.status,
      previewDigest: result.previewDigest,
      model: result.model,
      meshParts: count,
      meshSizeBytes: result.meshBytes.length
    },
    { headers }
  );
}
