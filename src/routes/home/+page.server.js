import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { homeSiteEntry } from '$lib/home/site-entry.js';
export function load() {
  return homeSiteEntry({ ...publicEnv, ...env }, true);
}
