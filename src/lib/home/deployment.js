/** Named apps have one immutable home target. Partial configuration fails closed.
 * @param {Record<string, any>} env */
export function existingHomeDeployment(env) {
 if(env.HOME_MODE===undefined&&env.HOME_ID===undefined&&env.HOME_OWNER_USER_ID===undefined)return null;
 if(env.HOME_MODE!=='existing'||typeof env.HOME_ID!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(env.HOME_ID)||typeof env.HOME_OWNER_USER_ID!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(env.HOME_OWNER_USER_ID))throw new Error('Existing-home deployment configuration is incomplete or invalid');
 return {mode:'existing',homeId:env.HOME_ID,ownerUserId:env.HOME_OWNER_USER_ID,name:typeof env.PUBLIC_APP_NAME==='string'?env.PUBLIC_APP_NAME.slice(0,160):env.HOME_ID,sharedRoot:`/shared/home-twin/${env.HOME_ID}`};
}

/** Generic rough-plan capture is opt-out per deployment. @param {Record<string, any>} env */
export function layoutDraftsEnabled(env) {
 return env.PUBLIC_HOME_LAYOUT_DRAFTS_ENABLED !== 'false';
}
