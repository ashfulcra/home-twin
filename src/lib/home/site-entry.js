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
