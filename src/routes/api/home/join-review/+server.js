import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {readSharedJoinRequest,saveJoinIntent,joinDigest} from '$lib/server/join-access.js';
import {buildJoinReview,joinIntentID} from '$lib/home/joining.js';
const headers={'Cache-Control':'private, no-store'};
/** @param {string} token */
async function owner(token){const access=await resolveHome(token);if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId||!access.home||!access.file)throw error(403,'Only this home’s current owner can review access requests');return access;}
export async function GET({cookies,url}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await owner(token);const source=await readSharedJoinRequest(access.endpoint,token,access.deployment,url.searchParams.get('code')??'');
 return json({...source,homeRevision:access.home.revision,homeFileVersion:access.file.id,homeDigest:joinDigest(access.file.text),status:'request-read-not-approved'},{headers});
}
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 let input;try{const text=await request.text();if(text.length>2500)throw new Error('Review too long');input=JSON.parse(text);if(input.scopeConfirmed!==true)throw new Error('Confirm the specific recipient, role and publication scope');}catch(e){throw error(400,e instanceof Error?e.message:'Invalid review');}
 const access=await owner(token);const source=await readSharedJoinRequest(access.endpoint,token,access.deployment,input.code);
 const homeDigest=joinDigest(access.file.text);
 if(source.requestDigest!==input.requestDigest||access.file.id!==input.homeFileVersion||access.home.revision!==input.homeRevision||homeDigest!==input.homeDigest)throw error(409,'The request or home changed. Reload and review the current records before deciding.');
 let value;try{value=buildJoinReview(source.request,input,{...access,homeId:access.home.id,homeRevision:access.home.revision,homeFileVersion:access.file.id,homeDigest,requestDigest:source.requestDigest},input.recordedAt);if(await joinIntentID(value)!==value.id)throw new Error('Review ID changed: retry the original contents and declared time');}catch(e){throw error(400,e instanceof Error?e.message:'Invalid review');}
 const result=await saveJoinIntent(access.endpoint,token,`${access.root}/join-decisions/${value.id}-${joinDigest(JSON.stringify(value))}.json`,value);
 return json({status:result.confirmed?'saved-review-intent':'pending-readback',review:result.value,accessStatus:'not-granted-by-this-action'},{status:result.confirmed?(result.reused?200:201):202,headers});
}
