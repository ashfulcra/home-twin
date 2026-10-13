import { existingHomeDeployment } from './deployment.js';
/** The public guide requires neither login nor a household read. Named apps
 * and the explicit /home entry preserve their existing authentication flow.
 * @param {Record<string,any>} env @param {boolean} [household] */
export function homeSiteEntry(env, household = false) {
  if (env.HOME_SITE_MODE !== undefined && !['home', 'guide'].includes(env.HOME_SITE_MODE))
    throw Error('Home site configuration is invalid');
  if (env.HOME_SITE_MODE === 'guide' && !household)
    return { siteMode: 'guide', existingHome: false };
  return { siteMode: 'home', existingHome: !!existingHomeDeployment(env) };
}
/** @param {Record<string,any>} env */
export function householdReturnUrl(env) {
  if (env.HOME_SITE_MODE !== undefined && !['home', 'guide'].includes(env.HOME_SITE_MODE))
    throw Error('Home site configuration is invalid');
  return env.HOME_SITE_MODE === 'guide' ? '/home' : '/';
}
/** Redirect only after a positively confirmed setup. @param {any} result @param {string} url */
export function confirmedSetupDestination(result, url) {
  if (!['/', '/home'].includes(url)) throw Error('Household destination is invalid');
  if (result?.status === 'pending-readback') return null;
  if (result?.status !== 'ready' || typeof result.homeId !== 'string' || !result.homeId)
    throw Error('Setup could not be confirmed. Retry these same answers.');
  return url;
}
