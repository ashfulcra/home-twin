import { resolveHome } from '$lib/server/home-access.js';
import { readHomeContributions } from '$lib/server/home-contributions.js';
import { error, json } from '@sveltejs/kit';
import { reconcileContributions } from '$lib/home/contributions.js';
import { buildHouseholdFollowups } from '$lib/home/household-followups.js';
import { buildReviewPacket } from '$lib/home/review-packet.js';
import { projectHome } from '$lib/home/projection.js';
export async function GET({ cookies }) {
  const token = cookies.get('fulcra_access_token');
  if (!token) throw error(401, 'Sign in to view your home');
  try {
    const access = await resolveHome(token, { allowJoining: true });
    const { file, home } = access;
    if ('joining' in access && access.joining)
      return json(
        { status: 'joining', deployment: access.deployment, join: { status: 'not-approved' } },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    if (!file)
      return json({ status: 'empty' }, { headers: { 'Cache-Control': 'private, no-store' } });
    if (home.schemaVersion !== 1) throw error(422, 'Unsupported home data version');
    const { rows, unavailable } = await readHomeContributions(access, token);
    const result = reconcileContributions(home, rows);
    const followups = buildHouseholdFollowups(result.home, {
      homeId: home.id,
      ownerUserId: access.ownerUserId,
      role: access.role,
      fileVersion: file.id,
      reviewCount: result.review.length,
      unavailableCount: unavailable.length
    });
    return json(
      {
        status: 'ready',
        callerId: access.userId,
        deployment: 'deployment' in access ? access.deployment : null,
        followups,
        home: projectHome(result.home, new Date().toISOString()),
        review: result.review,
        reviewContext: buildReviewPacket(home, result.review, {
          role: access.role,
          fileVersion: file.id
        }).items,
        accepted: result.accepted,
        role: access.role,
        unavailableMembers: unavailable,
        fileVersion: file.id
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    if (err instanceof Error && /status 403|failed: 403/.test(err.message))
      throw error(403, 'Shared home access is unavailable or revoked');
    if (err instanceof Error && /status 401|failed: 401/.test(err.message))
      throw error(401, 'Session expired');
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(502, 'Home data is unavailable. Your saved records are unchanged.');
  }
}
