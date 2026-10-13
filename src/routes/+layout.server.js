import { env } from '$env/dynamic/private';
import { householdReturnUrl } from '$lib/home/site-entry.js';
export function load() {
  return { householdUrl: householdReturnUrl(env) };
}
