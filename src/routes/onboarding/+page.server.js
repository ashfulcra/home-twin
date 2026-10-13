import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { redirect } from '@sveltejs/kit';
import { existingHomeDeployment } from '$lib/home/deployment.js';
import { householdReturnUrl } from '$lib/home/site-entry.js';
export function load() {
  if (existingHomeDeployment({ ...publicEnv, ...env }))
    throw redirect(303, householdReturnUrl(env));
  return {};
}
