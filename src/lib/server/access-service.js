import {env} from '$env/dynamic/private';
/** Relay the signed-in caller; never use a deployment owner's credential.
 * @param {string} token @param {string} homeId @param {string} action @param {string} [reviewCode] @param {string} [ownerUserId] */
export async function callAccessService(token,homeId,action,reviewCode,ownerUserId){
 if(!env.HOME_ACCESS_SERVICE_URL||!env.HOME_ACCESS_SERVICE_KEY)throw Error('Persistent home access service is not configured');
 if(typeof ownerUserId!=='string'||!/^[a-f0-9-]{36}$/.test(ownerUserId))throw Error('Configured home owner required');
 const url=new URL(env.HOME_ACCESS_SERVICE_URL);if(url.protocol!=='https:')throw Error('Secure access service required');
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+env.HOME_ACCESS_SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify({token,homeId,ownerUserId,action,...(reviewCode?{reviewCode}:{})}),signal:AbortSignal.timeout(110000)});
 if(!r.ok)throw Error('Access setup remains unconfirmed; retry the same operation.');
 const value=await r.json();if(!['review-required','pending-approval','request-rejected','outgoing-confirmed-member-unverified','rejection-recorded'].includes(value?.status))throw Error('Access service result is unverified');
 if(value.status==='review-required'&&value.noAccessMutationStarted!==true)throw Error('Access preflight status is unverified');
 return value;
}
